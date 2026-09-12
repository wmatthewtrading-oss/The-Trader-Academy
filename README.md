# The Trader Academy — backend (Discord login + role-gated access)

This adds a real login system: members log in with Discord, and the server
checks their roles in your Discord server to decide what they can see.

- Anyone can view the homepage (`/`)
- Only people with your **member** role can view `/lectures`
- Only people with your **admin** role can view `/admin`

## 1. Create a Discord Application

1. Go to https://discord.com/developers/applications → **New Application**.
2. Name it (e.g. "Trader Academy Login").
3. Under **OAuth2 → General**, copy the **Client ID** and **Client Secret**
   into your `.env` as `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET`.
4. Still under OAuth2, click **Add Redirect** and add:
   `https://yourdomain.com/auth/discord/callback`
   (use your real deployed URL — must match `DISCORD_REDIRECT_URI` in `.env` exactly).

## 2. Create the bot (used to check roles)

1. Go to the **Bot** tab → **Add Bot**.
2. Copy the **Token** into `.env` as `DISCORD_BOT_TOKEN`. Keep this secret —
   anyone with it can control your bot.
3. Under **Privileged Gateway Intents**, turn on **Server Members Intent**
   (not strictly required for the single-member lookup this app uses, but
   worth enabling now in case you expand this later).

## 3. Invite the bot into your server

1. Go to **OAuth2 → URL Generator**.
2. Check the `bot` scope. You don't need any special permissions checked —
   the bot just needs to *be a member* of your server to look up roles.
3. Open the generated URL, and add the bot to your Discord server.

## 4. Get your Guild ID and Role IDs

1. In Discord, go to **User Settings → Advanced → Developer Mode** and turn it on.
2. Right-click your server icon → **Copy Server ID** → this is `DISCORD_GUILD_ID`.
3. Go to **Server Settings → Roles**, right-click your paying-member role →
   **Copy Role ID** → this is `DISCORD_MEMBER_ROLE_ID`.
4. Do the same for your admin/staff role → `DISCORD_ADMIN_ROLE_ID`.

## 5. Fill in `.env`

Copy `.env.example` to `.env` and fill in everything from steps 1-4, plus a
random string for `SESSION_SECRET` (e.g. run `openssl rand -hex 32`).

## 6. Run it locally

```bash
npm install
npm start
```

Visit `http://localhost:3000`. Note: Discord requires your redirect URI to
be reachable, so for local testing you'll want a tool like `ngrok` to expose
`localhost:3000`, and a matching Redirect URI added in step 1.4.

## 7. Deploy (Render / Railway / similar)

1. Push this `backend` folder to a GitHub repo.
2. Create a new **Web Service** on Render or Railway, pointed at that repo.
3. Set the build command to `npm install` and start command to `npm start`.
4. Add all the same variables from `.env` in the host's environment variable
   settings (never commit your real `.env` file).
5. Once deployed, update `DISCORD_REDIRECT_URI` (both in `.env` on the host,
   and in the Discord app's OAuth2 redirect list) to your real live URL.

**Note on Vercel specifically:** Vercel runs this as serverless functions,
and the in-memory sessions used here won't persist reliably between
requests on serverless. Render or Railway (which run this as a normal,
always-on Node process) will work out of the box. If you're set on Vercel,
say so and I'll swap the session storage to something serverless-friendly.

## What's next

This gives you working login + role checks, and a placeholder `/admin`
page confirming access works. Lecture titles/links live directly in
`protected/lectures.html` — edit the `SECTORS` array near the top of its
`<script>` section to add or change lectures, then push the change and
redeploy.
