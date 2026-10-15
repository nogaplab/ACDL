# Blog comments backend

The website is static, so the comments and the comment subscriptions of the blog
are handled by a small Google Apps Script web app ([Code.gs](Code.gs)) attached
to a Google Sheet. The sheet is the database. Emails are sent from the Google
account that owns the script.

## Set up (once)

1. Create a new Google Sheet (any name, e.g. "ACDL blog comments").
2. In the sheet: **Extensions → Apps Script**. Delete the sample code, paste the
   contents of `Code.gs`, and save.
3. At the top of the script, check `CONFIG`. Set `OWNER_EMAIL` to your address
   if you want an email for every new comment.
4. **Deploy → New deployment**, type **Web app**, with
   - Execute as: **Me**
   - Who has access: **Anyone**

   Approve the permissions Google asks for (the sheet, sending email, and
   fetching `posts.json` from the site).
5. Copy the web app URL (it ends in `/exec`) into `COMMENTS_API` at the top of
   `website/shared/blog.js`, then build and deploy the website.

The two tabs, `Comments` and `Subscribers`, are created on first use.

## Changing the script later

After editing the code in the Apps Script editor, publish it with **Deploy →
Manage deployments → Edit (pencil) → Version: New version → Deploy**. This keeps
the same URL. A *new deployment* would get a new URL.

Keep `Code.gs` in this folder in sync with what is deployed.

## Moderating

Open the sheet, tab `Comments`:

- To hide a comment, type anything (e.g. `x`) in its `hidden` column.
- To remove it for good, delete its row.

In the `Subscribers` tab, `confirmed` is TRUE once the person clicked the link
in the confirmation email. Only confirmed addresses get emails. Deleting a row
unsubscribes that address.

## Limits

- A consumer Google account can send about 100 emails a day (Google Workspace:
  1,500). When the quota runs out, comments are still published, but the
  remaining notification emails for that day are not sent.
- Spam protection is a hidden form field, length limits, and hourly ceilings on
  comments and confirmation emails (`CONFIG`). There is no captcha.
