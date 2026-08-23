# Nmat Al Nahdat - Supabase Connected

## 1. Create the database
Open Supabase SQL Editor and run the complete file `supabase/schema.sql`.

## 2. Create the admin user
In Supabase Dashboard go to Authentication -> Users -> Add user.
Create an email/password user, for example your own admin email.
The website login now uses this Supabase account instead of the old hard-coded `admin/admin123`.

## 3. Open the website
Use a local web server (VS Code Live Server is recommended) or deploy the folder to GitHub Pages, Netlify, or Vercel.

## 4. First login / migration
On the first successful login, if the Supabase account has no `app_data` rows, the application migrates the existing browser LocalStorage data for Settings, Companies, Employees, Payments and Logs to Supabase.
If cloud data already exists, cloud data becomes the source of truth and is loaded into the browser cache.

## Security
The browser uses only the Supabase publishable key. Never expose a `service_role` or secret key. RLS restricts every `app_data` row to the authenticated Supabase user who owns it.
