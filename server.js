require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');

const {
  DISCORD_CLIENT_ID,
  DISCORD_CLIENT_SECRET,
  DISCORD_REDIRECT_URI,
  DISCORD_BOT_TOKEN,
  DISCORD_GUILD_ID,
  DISCORD_MEMBER_ROLE_ID,
  DISCORD_ADMIN_ROLE_ID,
  SESSION_SECRET,
  PORT = 3000,
} = process.env;

const REQUIRED_ENV = [
  'DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET', 'DISCORD_REDIRECT_URI',
  'DISCORD_BOT_TOKEN', 'DISCORD_GUILD_ID', 'DISCORD_MEMBER_ROLE_ID',
  'DISCORD_ADMIN_ROLE_ID', 'SESSION_SECRET',
];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length) {
  console.warn(`[startup] Missing env vars: ${missing.join(', ')} — auth will not work until these are set (see .env.example).`);
}

const app = express();

app.use(session({
  secret: SESSION_SECRET || 'dev-only-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production', // requires HTTPS in production
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
  },
}));

app.use('/assets', express.static(path.join(__dirname, 'public', 'assets')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---------- helpers ----------

function renderWithUser(filePath, user, res) {
  fs.readFile(filePath, 'utf8', (err, html) => {
    if (err) return res.status(500).send('Page failed to load.');
    const inject = `<script>window.__USER__ = ${JSON.stringify(user || null)};</script>`;
    html = html.replace('</head>', `${inject}</head>`);
    res.send(html);
  });
}

function requireRole(role) {
  return (req, res, next) => {
    const user = req.session.user;
    if (!user) return res.redirect('/auth/discord');
    const roles = user.roles || [];
    const allowed = role === 'admin' ? roles.includes('admin') : (roles.includes('member') || roles.includes('admin'));
    if (!allowed) {
      return res.status(403).send(`
        <div style="font-family:sans-serif;max-width:480px;margin:80px auto;text-align:center;color:#333;">
          <h2>Access denied</h2>
          <p>You're logged in as <b>${user.username}</b>, but your Discord account doesn't have the role required for this page.</p>
          <p><a href="/">Back to homepage</a></p>
        </div>
      `);
    }
    next();
  };
}

// ---------- public routes ----------

app.get('/', (req, res) => {
  renderWithUser(path.join(__dirname, 'public', 'index.html'), req.session.user, res);
});

app.get('/api/me', (req, res) => {
  res.json(req.session.user || null);
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// ---------- Discord OAuth ----------

app.get('/auth/discord', (req, res) => {
  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: DISCORD_REDIRECT_URI,
    response_type: 'code',
    scope: 'identify',
    prompt: 'consent',
  });
  res.redirect(`https://discord.com/api/oauth2/authorize?${params.toString()}`);
});

app.get('/auth/discord/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('Missing code from Discord.');

  try {
    // 1. Exchange the code for an access token
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: DISCORD_REDIRECT_URI,
      }),
    });
    if (!tokenRes.ok) throw new Error(`Token exchange failed: ${await tokenRes.text()}`);
    const tokenData = await tokenRes.json();

    // 2. Get the logged-in Discord user's identity
    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (!userRes.ok) throw new Error(`Fetching user failed: ${await userRes.text()}`);
    const discordUser = await userRes.json();

    // 3. Use the BOT token to look up this user's roles in your server.
    //    (The bot must already be a member of DISCORD_GUILD_ID.)
    const memberRes = await fetch(
      `https://discord.com/api/guilds/${DISCORD_GUILD_ID}/members/${discordUser.id}`,
      { headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` } }
    );

    let roleIds = [];
    if (memberRes.ok) {
      const member = await memberRes.json();
      roleIds = member.roles || [];
    } else if (memberRes.status === 404) {
      // User authenticated with Discord but isn't in your server at all.
      roleIds = [];
    } else {
      throw new Error(`Fetching guild member failed: ${await memberRes.text()}`);
    }

    const roles = [];
    if (roleIds.includes(DISCORD_MEMBER_ROLE_ID)) roles.push('member');
    if (roleIds.includes(DISCORD_ADMIN_ROLE_ID)) roles.push('admin');

    req.session.user = {
      id: discordUser.id,
      username: discordUser.username,
      avatar: discordUser.avatar
        ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
        : null,
      roles,
    };

    if (roles.includes('admin')) return res.redirect('/admin');
    if (roles.includes('member')) return res.redirect('/lectures');
    return res.redirect('/no-access');
  } catch (err) {
    console.error(err);
    res.status(500).send('Something went wrong logging in with Discord. Check server logs.');
  }
});

app.get('/no-access', (req, res) => {
  const user = req.session.user;
  res.send(`
    <div style="font-family:sans-serif;max-width:480px;margin:80px auto;text-align:center;color:#333;">
      <h2>You do not have access yet</h2>
      <p>You don't currently have access to The Trader Academy${user ? `, ${user.username}` : ''}.</p>
      <p>Please head to <a href="https://whop.com/matty-s-trading/the-trader-acadmey/" target="_blank" rel="noopener">whop.com/matty-s-trading/the-trader-acadmey</a> to join, then <a href="/auth/discord">log in again</a> once you're in.</p>
    </div>
  `);
});

// ---------- protected routes ----------

app.get('/lectures', requireRole('member'), (req, res) => {
  renderWithUser(path.join(__dirname, 'protected', 'lectures.html'), req.session.user, res);
});

app.get('/admin', requireRole('admin'), (req, res) => {
  res.send(`
    <div style="font-family:sans-serif;max-width:480px;margin:80px auto;text-align:center;color:#333;">
      <h2>Admin panel</h2>
      <p>You're in — logged in as <b>${req.session.user.username}</b> with admin access.</p>
      <p><a href="/lectures">Go to lectures</a></p>
    </div>
  `);
});

app.listen(PORT, () => {
  console.log(`Trader Academy server running on port ${PORT}`);
});
