# Rivalken

Rivalken is a browser-based 3D multiplayer racer for 64-bit Windows and Linux. The Three.js client connects to the Node.js WebSocket server; the server calculates race movement, fuel, and finish events, while the browser applies rewards to each player's encrypted profile. Races support six human drivers, with AI filling open seats.

The public-facing landing page is served at `/`; select **Play the game** to open `/play`. The race client and landing page are served by the same Node.js process; multiplayer uses its WebSocket server while account and encrypted-profile requests go directly from the browser to Supabase.

The landing page includes game-mode links, garage links, and local display settings. Public career standings are disabled to keep player profiles private. It uses original inline artwork; account features use Supabase Free when configured, with no paid assets or services required.

## Run the server

Install Node.js 18 or newer, then from this folder:

```sh
npm install
npm start
```

Open [http://localhost:3001](http://localhost:3001) to play. To race with people on the same network, share the computer's LAN IP with them and have them open `http://<server-ip>:3001`. Allow incoming TCP connections on port 3001 in the server computer's firewall if needed.

The server uses port 3001 by default. Set `PORT` to use a different port. The server binds to all network interfaces by default; set `HOST=127.0.0.1` to make it local-only.

## Controls

- **W / Up arrow:** accelerate
- **S / Down arrow / Space:** brake
- **A / Left arrow:** steer left
- **D / Right arrow:** steer right
- Brake before tight corners; carrying too much speed through a turn causes grip loss and pushes the car wide. Use steering to correct the slide.

Configure Supabase as described below, then create an account or sign in and use the **Garage** tab to buy cars, choose paint, finish, decals, wheels, and spoilers, and buy performance upgrades. Earn 450 credits and 180 XP for finishing a race. Your encrypted profile syncs through Supabase; the game server does not store it.

Each race is three laps around the 5.2 km Rivalken Highlands circuit, with long straights, hairpins, and a technical infield section. Fuel starts full, is calculated on the server from distance, vehicle economy, and engine load, and refills on the next grid. Press **-** or click **FUEL** during a race to open the fuel panel; an empty tank cuts the engine and the car coasts.

## Supabase setup (Free)

This repository does not create a Supabase project. For a Free project:

1. Copy `.env.example` to `.env` and set `SUPABASE_URL` and `SUPABASE_ANON_KEY` from the Supabase project API settings. The anon/publishable key is public client configuration; never put the service-role key here.
2. Apply `supabase/migrations/20261120000000_private_player_profiles.sql` in the Supabase SQL Editor.
3. In Supabase Auth settings, disable email confirmation because Rivalken uses a synthetic, non-deliverable login identifier, not an email address. There is no email-based password recovery.
4. With the Supabase CLI linked to your project, deploy `supabase/functions/delete-account` (`supabase functions deploy delete-account`). In the Supabase Dashboard's Edge Function secrets, set `SUPABASE_SERVICE_ROLE_KEY`; never put that key in this app's `.env`. The function also needs the project URL and anon key in its environment (Supabase may provide these by default; configure them if not).
5. Start the game with `npm start`.

The browser derives the Auth login identifier from a lowercase username and sends the password directly to Supabase Auth. Saved profiles are encrypted in the browser before they are stored; Row Level Security restricts access to each player's own row. Career data is not used for a public leaderboard. Account deletion works only after the Edge Function has been deployed and configured. Supabase Free has quotas and may pause inactive projects; limits and terms can change.

See [DATA-PRIVACY.md](DATA-PRIVACY.md) for what data is collected, where it is stored, the best-effort encryption limits, the legacy local account file, and deletion behavior.

## Legacy data and network notes

The old `data/accounts.json` file was deleted at the user's request; its local accounts and saves are lost. This does not remove copies in backups or other locations. No automatic migration is provided.

The race server receives racer nicknames and selected car appearance/upgrade settings needed during a live race. The username is visible to other racers. The game server code does not persist connecting IP addresses, but the network/hosting provider can observe connections. Use `http://localhost:3001` locally or put the server behind HTTPS: account creation/sign-in is blocked from non-secure LAN HTTP origins, and the built-in server uses plain HTTP by default.

## Public hosting

The project is configured to run locally without paid hosting. A public URL needs a host that can run a persistent Node.js process and WebSockets; free-host limits may affect availability and race sessions. No hosting resources are created by running this project locally.
