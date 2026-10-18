# Vantage for agents

Vantage ({{site}}) is the user's portfolio manager. It has:

- a watchlist of companies in groups, with live price charts;
- a calendar of upcoming events for those companies;
- news about them, with your read on each;
- their broker account: holdings, trades and account value over time.

You keep it up to date for the user: change the watchlist when they ask, record events and news they mention or you find worth keeping, and send their broker statements if you fetch them.

## Access

- If the user gave you an agent key (they make them under Agent keys in their profile menu), exchange it for a session.
- If you stored a refresh token earlier, refresh the session.
- Otherwise, onboard them: ask for their email and whether they want Vantage's default companies or their own list, then create the account. Store the refresh token durably, tell the user where, and tell them to open the sign-in email Vantage sends.

## API

Everything goes through the API described at {{openapi}}. Read it before your first call. The user's data is in the tables described at {{restOpenapi}}.
