# Hisaab

Group expense splitter built with plain **HTML, CSS and JavaScript** and **Supabase**.
No Express, no EJS, no server code. The browser talks to Supabase directly.

## Set up (about 10 minutes)

### 1. Create the Supabase project
1. Go to https://supabase.com, sign in, and click **New project**.
2. When it is ready, open **SQL Editor → New query**, paste everything from `supabase-setup.sql`, and click **Run**.
   This creates the tables, the security rules and the functions. It is safe to run again.

> **Already set up an earlier version?** Do not re-create anything. Run `supabase-update-1.sql` once in the SQL Editor
> (invite links, add members later, edit expenses). Your data is kept.

### 2. Sign-up settings (Authentication → Providers → Email)
- For quick testing, switch **Confirm email** OFF so new accounts can log in immediately.
- For a real launch, leave it ON and set **Authentication → URL Configuration → Site URL** to your Vercel address.

### 3. Connect the app
Open **Project Settings → API**, then copy the **Project URL** and the **anon public** key into `js/config.js`.

### 4. Run it on your computer
Pages use JavaScript modules, so they must be opened through a local server (not by double-clicking).
- VS Code: right-click `index.html` → **Open with Live Server** (the "Go Live" button), or
- Terminal: `npm start` (opens http://localhost:3000)

### 5. Deploy on Vercel
1. Push this folder to GitHub.
2. On Vercel: **Add New → Project**, import the repo.
3. Framework Preset: **Other**. Leave Build Command and Output Directory empty. Click **Deploy**.

No config file and no environment variables are needed.

## Folder structure
```
index.html, login.html, signup.html,
groups.html, new-group.html, group.html,
add-expense.html (also used to edit), expense.html, join.html
css/style.css
img/               logo + icons
favicon.ico
js/
  config.js        Supabase URL + anon key
  supabase.js      connects to Supabase
  ui.js            navbar, flash messages, tabs, theme, sign-in check
  logic.js         splitting + who-owes-whom calculations
  charts.js        Chart.js charts
  export.js        CSV and PDF export
  pages/           one script per page
supabase-setup.sql        tables, security rules, functions (fresh install)
supabase-update-1.sql     upgrade for an existing database
```

## How it differs from the Express version
- **Login:** Supabase Auth (replaces bcrypt + sessions). Old accounts are not carried over: everyone signs up again.
- **Adding members:** type friends' emails when creating a group, add more later from the group's **Members** tab, or send the **invite link**. The old "list of all users" is gone, because people can now only see others who share a group with them.
- **Editing:** the person who added or paid for an expense can edit it (✏️ Edit).
- **Security:** Row Level Security in the database decides what each person can see, so no one can open or change another group's data.
- **Equal splits:** shares always add up exactly (₹100 ÷ 3 = 33.34 + 33.33 + 33.33).
- **Paid By** now defaults to you.