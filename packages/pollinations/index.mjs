// Pollinations provider plugin for magpie and OpenCode.
//
// HTTP calls live in api.mjs, the model catalog conversion in models.mjs,
// and the wallet/quest mapping in usage.mjs. This file wires those modules
// into magpie's host contract. It uses apiGet directly (rather than the
// thin fetchXxx wrappers) so each hook can see status and the error/signIn
// signal and report it in the shape magpie expects.

import { GEN, ENTER, apiGet } from "./api.mjs"
import { SEED_MODELS, runtimeModels } from "./models.mjs"
import { usageFrom } from "./usage.mjs"

export const ID = "pollinations"

// Pollinations' own publishable client id, safe to embed. It only attributes
// the sign-in to this plugin; it is not a secret and cannot spend Pollen.
const APP_CLIENT_ID = "pk_QPDopXO7XzKugYVr"
const DEVICE_SCOPE = "profile usage"

const text = (v) => (typeof v === "string" ? v.trim() : "")
const isObject = (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v)

// keyOf reads the sk_ secret from either sign-in shape: an api key stored by
// the manual method, or the access token the device flow exchanged for the
// same kind of secret key.
function keyOf(auth) {
  if (!isObject(auth)) return ""
  if (auth.type === "api" && text(auth.key)) return text(auth.key)
  if (auth.type === "oauth" && text(auth.access)) return text(auth.access)
  return ""
}

const expiredStatus = (status) => status === 401 || status === 403

const sleep = (ms, signal) => new Promise((resolve, reject) => {
  if (signal?.aborted) return reject(signal.reason ?? new Error("aborted"))
  const timer = setTimeout(() => { signal?.removeEventListener("abort", stop); resolve() }, ms)
  const stop = () => { clearTimeout(timer); reject(signal?.reason ?? new Error("aborted")) }
  signal?.addEventListener("abort", stop, { once: true })
})

// deviceAuthorize runs Pollinations' device flow. Magpie calls authorize()
// once to show the URL and instructions, then callback() to trade the code.
// Per Magpie's contract the callback must return {type:"success", ...} with
// the fields to store, or {type:"failed", error}.
async function deviceAuthorize(_inputs, { signal } = {}) {
  let started
  try {
    const res = await fetch(`${ENTER}/api/device/code`, {
      method: "POST",
      redirect: "error",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: APP_CLIENT_ID, scope: DEVICE_SCOPE }),
      signal: signal ?? AbortSignal.timeout(15000),
    })
    if (!res.ok) throw new Error(`device code request returned HTTP ${res.status}`)
    started = await res.json()
  } catch (error) {
    return { type: "failed", error: `Could not start Pollinations sign-in: ${error?.message ?? error}` }
  }

  const userCode = text(started.user_code)
  const deviceCode = text(started.device_code)
  const rawUrl = text(started.verification_uri_complete) || text(started.verification_uri)
  if (!userCode || !deviceCode || !rawUrl) {
    return { type: "failed", error: "Pollinations did not return a device code. Please try again." }
  }

  let url
  try {
    const parsed = new URL(rawUrl)
    if (parsed.protocol !== "https:" || parsed.hostname !== "enter.pollinations.ai") throw new Error("bad verification URL")
    if (parsed.username || parsed.password) throw new Error("bad verification URL")
    url = parsed.href
  } catch {
    return { type: "failed", error: "Pollinations returned an invalid verification URL." }
  }

  const interval = Number.isFinite(started.interval) && started.interval > 0 ? started.interval : 5
  const expiresIn = Number.isFinite(started.expires_in) && started.expires_in > 0 ? started.expires_in : 600
  const deadline = Date.now() + Math.min(expiresIn * 1000, 15 * 60 * 1000)

  let pending
  const poll = async () => {
    let wait = interval * 1000
    while (!signal?.aborted && Date.now() < deadline) {
      await sleep(wait, signal)
      if (signal?.aborted) throw new Error("aborted")
      if (Date.now() >= deadline) break
      let res, body
      try {
        res = await fetch(`${ENTER}/api/device/token`, {
          method: "POST",
          redirect: "error",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({ client_id: APP_CLIENT_ID, device_code: deviceCode }),
          signal: signal ?? AbortSignal.timeout(15000),
        })
        body = await res.json().catch(() => ({}))
      } catch (error) {
        if (error?.name === "AbortError") throw error
        wait = Math.min(wait * 2, 60000)
        continue
      }
      const access = text(body?.access_token) || text(body?.sk)
      if (res.ok && access) {
        // Validate that the exchanged key is real before storing it. The key
        // is an sk_ secret; a failed check is not saved.
        let accountId = ""
        try {
          const info = await apiGet("/account/key", { key: access, signal })
          if (info.ok && isObject(info.data)) {
            if (info.data.valid === false) throw new Error("key is not valid")
            if (text(info.data.name)) accountId = text(info.data.name)
          }
        } catch (error) {
          if (error?.name === "AbortError") throw error
          // A key without account permission still validates as a secret;
          // continue without an account name.
        }
        return { type: "success", access, refresh: "", expires: 0, ...(accountId ? { accountId } : {}), source: "device" }
      }
      const code = text(body?.error)
      if (code === "authorization_pending" || code === "slow_down") {
        wait = code === "slow_down" ? wait + 5000 : interval * 1000
        continue
      }
      if (code === "expired_token" || code === "access_denied") break
      if (!res.ok && res.status >= 500) { wait = Math.min(wait * 2, 60000); continue }
      break
    }
    return { type: "failed", error: "Pollinations sign-in was not completed in time. Please try again." }
  }

  return {
    url,
    method: "auto",
    instructions: `Open the Pollinations page and confirm code ${userCode}. Sign-in finishes automatically once you approve it.`,
    callback() {
      pending ??= poll().catch((error) => ({
        type: "failed",
        error: error?.name === "AbortError" ? "Sign-in cancelled" : `Pollinations sign-in failed: ${error?.message ?? error}`,
      }))
      return pending
    },
  }
}

export const PollinationsPlugin = async () => {
  // SEED_MODELS is already a config-shaped table. The live catalog replaces
  // it on the next models listing; seeds only keep the provider visible
  // before the first sign-in.
  const seed = SEED_MODELS

  return {
    async config(cfg) {
      cfg.provider ??= {}
      const was = cfg.provider[ID] ?? {}
      cfg.provider[ID] = {
        name: "Pollinations",
        npm: "@ai-sdk/openai-compatible",
        api: GEN + "/v1",
        ...was,
        models: { ...seed, ...(was.models ?? {}) },
      }
    },

    auth: {
      provider: ID,
      methods: [
        { type: "oauth", label: "Device code (recommended)", authorize: deviceAuthorize },
        { type: "api", label: "Secret key (sk_)", placeholder: "sk-..." },
      ],
      async loader(getAuth) {
        const key = keyOf(await getAuth())
        if (!key) return {}
        // Magpie adds Authorization from apiKey. The vendor speaks plain
        // OpenAI protocol at /v1, so no custom fetch is needed.
        return { baseURL: GEN + "/v1", apiKey: key }
      },
      async usage(getAuth) {
        const key = keyOf(await getAuth())
        if (!key) return {}
        const balanceRes = await apiGet("/account/balance", { key })
        if (expiredStatus(balanceRes.status)) {
          return { plan: "Pollinations", windows: [], signIn: "expired", error: "Pollinations refused this key. Sign in again." }
        }
        if (!balanceRes.ok) {
          return { plan: "Pollinations", windows: [], signIn: "kept", error: "Could not read Pollinations balance. Try again later." }
        }
        return usageFrom({
          balance: isObject(balanceRes.data) ? balanceRes.data : {},
          profile: {},
        })
      },
      async calls(getAuth, provider, { since, signal } = {}) {
        const key = keyOf(await getAuth())
        if (!key) return { calls: [] }
        const params = new URLSearchParams({ limit: "100" })
        const res = await apiGet(`/account/usage?${params.toString()}`, { key, signal })
        if (!res.ok) return { calls: [] }
        const rows = Array.isArray(res.data?.usage) ? res.data.usage : []
        const sinceMs = Number(since) || 0
        const calls = []
        for (const row of rows) {
          const t = Date.parse(row.timestamp)
          const rid = text(row.id) || text(row.event_id) || (Number.isFinite(t) ? `${t}:${text(row.model)}:${text(row.api_key)}` : "")
          if (!rid || !Number.isFinite(t) || t <= sinceMs) continue
          calls.push({
            rid,
            t,
            model: text(row.model),
            in: Number(row.input_text_tokens) || 0,
            out: Number(row.output_text_tokens) || 0,
            cache_read: Number(row.input_cached_tokens) || 0,
            cache_write: 0,
            ...(Number.isFinite(Number(row.cost_usd)) ? { cost: Number(row.cost_usd) } : {}),
          })
        }
        return { calls }
      },
    },

    provider: {
      id: ID,
      async models(provider, { auth } = {}) {
        const key = keyOf(auth)
        const res = await apiGet("/models", { key })
        if (!res.ok) return provider?.models ?? {}
        const catalog = Array.isArray(res.data) ? res.data : []
        if (!catalog.length) return provider?.models ?? {}
        return runtimeModels(catalog, provider?.id ?? ID, GEN + "/v1")
      },
    },
  }
}
