# Pollinations for magpie and OpenCode

Pollinations (https://pollinations.ai) as a provider plugin for magpie and OpenCode. The plugin signs in with a Pollinations secret key or a device code, discovers the live OpenAI-compatible text models, shows the Pollen wallet balance, and lists usage.

## What it does

- **Two ways to sign in.** Paste a secret key (`sk_...`), or use the device code flow: the plugin opens the Pollinations consent page and you confirm a short code in the browser. The device flow uses Pollinations' own publishable client id; no client secret is embedded.
- **Live models.** Reads `GET /models` and keeps every text model that serves `/v1/chat/completions`. Model ids keep their full `publisher/model` form, so models from different publishers never collide. Cost and context limits come from the vendor's own catalog.
- **Wallet balance.** Shows total Pollen plus separate Quest and paid buckets when the key has the `account:usage` permission. The balance is published as a prepaid-wallet window so magpie's router can prefer accounts with more credit left.
- **Usage.** Reads account usage and reports each call to magpie, including token counts and the USD cost Pollinations assigned.

## Quests and check-in

Quest completion happens server-side as the account uses models. Rewards must be claimed on the Pollinations website (https://enter.pollinations.ai/quests); Pollinations exposes no API to claim them. Since a plugin check-in cannot add quota, this plugin intentionally has no daily check-in hook and never shows a check-in control in magpie.

## Sign in

1. In magpie, add this plugin and open the provider's sign-in page.
2. Choose **Device code (recommended)** and confirm the code in the browser that opens, or choose **Secret key** and paste an `sk_` key from https://enter.pollinations.ai/keys.
3. Models appear automatically after sign-in.

For the balance and quest panels to fill in, the key needs the read-only `account:usage` permission. Keys created through the device flow ask for `profile usage` scope; keys you paste must already carry that permission. A key with only a pollen budget still works for generation, but the plugin will show only the budget balance.

## Pricing

Pollinations prices models in Pollen per token. The plugin converts the vendor's per-token figure to magpie's per-million-token cost. Paid-only models are marked as not free.

## Development

```sh
bun test
```

The tests use a mock `fetch` and never touch the network.

## License

MIT
