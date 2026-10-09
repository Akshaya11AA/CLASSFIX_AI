
# ClassFix AI — Setup Guide

## Requirements
- A Supabase account
- A Netlify account
- A Google Cloud account if you want Google sign-in
- VS Code

## Step 1: Create the Supabase project
1. Open https://supabase.com/
2. Create a new project.
3. Wait until the database is ready.
4. Open Project Settings → API.
5. Copy the Project URL and publishable/anon key.
6. Paste them into config.js.

Never place your service_role key in browser JavaScript.

## Step 2: Create the admin account FIRST
1. Open Supabase → Authentication → Users.
2. Add a user.
3. Use admin123@gmail.com.
4. Set a strong password.
5. Confirm the email if the dashboard provides that option.

Do this before publishing the website or allowing public registration.
Do not allow another user to register this admin email.

The password 1234 is not safe for a public deployment.

## Step 3: Create database and private photo storage
1. Open Supabase → SQL Editor.
2. Create a new query.
3. Paste all contents of supabase-schema.sql.
4. Run the query.
5. Check Table Editor for the public.issues table.
6. Check Storage for the private issue-photos bucket.

## Step 4: Enable email/password authentication
1. Open Authentication → Sign In / Providers.
2. Enable Email.
3. Set your email-confirmation preference.
4. If confirmation is enabled, users must confirm their email before signing in.
5. Configure your site's URL and redirect URLs under Authentication → URL Configuration.

During local testing, use the actual local URL displayed by Live Server.
For deployment, add your actual Netlify URL.

## Step 5: Enable Google sign-in
1. Open Google Cloud Console:
   https://console.cloud.google.com/
2. Create a project or select an existing one.
3. Configure the OAuth consent screen.
4. Create an OAuth client ID for a Web application.
5. In Supabase → Authentication → Sign In / Providers → Google, enable Google.
6. Copy the OAuth Client ID and Client Secret from Google Cloud into Supabase.
7. In Google Cloud, add the callback URL shown by Supabase as an authorized redirect URI.
8. In Supabase URL Configuration, add your local development URL and deployed website URL to allowed redirect URLs.

Do not put the Google Client Secret into config.js.

## Step 6: Run locally
1. Open the ClassFix_AI folder in VS Code.
2. Install the Live Server extension.
3. Right-click index.html.
4. Choose Open with Live Server.
5. Sign in as a student/staff user and submit a test report.
6. Sign out and sign in as the administrator.
7. Verify the report appears in the admin dashboard.
8. Test status updates and CSV export.

## Step 7: Deploy on Netlify
1. Save all project files.
2. Open https://app.netlify.com/
3. Create a site using manual deploy, or connect the project to GitHub.
4. Upload the folder containing index.html, styles.css, config.js, and app.js.
5. Copy the published Netlify URL.
6. Add that URL to Supabase Authentication → URL Configuration.
7. Update Google OAuth redirect settings if needed.
8. Test the deployed website in two different browser sessions.

For a plain static site:
- Build command: leave empty
- Publish directory: the folder containing index.html

## Security checks before public use
- Create the administrator account before enabling public registrations.
- Use a strong administrator password.
- Never expose the service_role key.
- Keep Row Level Security enabled.
- Test that one student cannot read another student's reports.
- Test that only admin123@gmail.com can update issues or read all reports.
- Keep photos in the private issue-photos bucket.
- Do not upload sensitive personal information in photos.