# Nmat al Nahdat – Employee & Monthly Payment Management

Frontend GitHub-ready management dashboard matching the provided design.

## Admin Login
- Username: `admin`
- Password: `admin123`
- Use the Admin menu at the top-right to log out.

## Data Storage
All employees, companies, payments, settings, activity logs, language preference, login state, and last-save timestamp are stored in the browser's `localStorage` with no automatic expiry.

**Important:** this is permanent browser-local storage, not cloud storage. Clearing browser site data, using a different browser/device, or private/incognito mode can remove or isolate the data. Use the built-in Backup/Restore JSON feature regularly. For true permanent multi-device storage, connect the same frontend to Firebase or Supabase.

## Delete Fix
Delete buttons are exposed on `window`, so dynamically rendered `onclick="delete..."` controls work correctly. Employee, company, payment, and Delete All actions require confirmation and immediately save the updated records.

## Run
Open `index.html` in a browser or deploy the folder to GitHub Pages.
