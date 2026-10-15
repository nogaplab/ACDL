// Comments and comment subscriptions for the ACDL blog.
//
// A Google Apps Script web app bound to a Google Sheet. The sheet is the
// database: one tab for comments, one for subscribers. See README.md in this
// folder for how to deploy it.
//
// Requests (all answered with JSON):
//   GET  ?action=list&post=<slug>                      the comments of a post
//   POST {action:'comment', post, name, title, text}   publish a comment
//   POST {action:'subscribe', post, email}             send a confirmation email
//   POST {action:'confirm', token}                     confirm a subscription
//   POST {action:'unsubscribe', token}                 remove a subscription

const CONFIG = {
  // Where the blog is served. Links in the emails are built from this.
  SITE_URL: 'https://acdlang.org',
  // Sender name on the emails.
  SENDER_NAME: 'ACDL Blog',
  // An address that gets an email for every new comment, e.g. to moderate.
  // Leave empty to turn this off.
  OWNER_EMAIL: '',
  // Ceilings for the whole blog, as a brake on abuse.
  MAX_COMMENTS_PER_HOUR: 30,
  MAX_CONFIRMATION_EMAILS_PER_HOUR: 20,
};

const LIMITS = { name: 80, title: 150, text: 5000 };
const COMMENT_COLUMNS = ['id', 'post', 'date', 'name', 'title', 'text', 'hidden'];
const SUBSCRIBER_COLUMNS = ['post', 'email', 'token', 'confirmed', 'date'];

function doGet(e) {
  const params = (e && e.parameter) || {};
  if (params.action !== 'list') return json({ ok: true });
  return respond(() => listComments(params.post));
}

function doPost(e) {
  return respond(() => {
    let req;
    try {
      req = JSON.parse(e.postData.contents);
    } catch (err) {
      fail('Bad request.');
    }
    switch (req.action) {
      case 'comment': return addComment(req);
      case 'subscribe': return subscribe(req);
      case 'confirm': return confirmSubscription(req);
      case 'unsubscribe': return unsubscribe(req);
      default: fail('Bad request.');
    }
  });
}

// ── Comments ────────────────────────────────────────────────────────────────

function listComments(post) {
  checkSlug(post);
  const comments = rows(sheet('Comments', COMMENT_COLUMNS))
    .filter((r) => r[1] === post && !isHidden(r[6]))
    .map((r) => ({ name: String(r[3]), title: String(r[4]), text: String(r[5]), date: isoDate(r[2]) }));
  return { comments };
}

function addComment(req) {
  const post = req.post;
  const postTitle = checkPost(post);
  const name = clean(req.name, true);
  const title = clean(req.title, true);
  const text = clean(req.text, false);
  if (!name || !title || !text) fail('Please fill in your name, a title and a comment.');
  if (name.length > LIMITS.name || title.length > LIMITS.title || text.length > LIMITS.text) {
    fail('That comment is too long.');
  }
  const comment = { name, title, text, date: new Date().toISOString() };

  // The "website" field is invisible on the page, so only a bot fills it in.
  // Answer as if the comment was published, and drop it.
  if (req.website) return { comment };

  withLock(() => {
    const sh = sheet('Comments', COMMENT_COLUMNS);
    const duplicate = rows(sh).some((r) => r[1] === post && r[3] === name && r[5] === text);
    if (duplicate) fail('This comment was already published.');
    throttle('comments', CONFIG.MAX_COMMENTS_PER_HOUR);
    sh.appendRow([Utilities.getUuid(), asText(post), asText(comment.date), asText(name), asText(title), asText(text), '']);
  });

  notifySubscribers(post, postTitle, comment);
  return { comment };
}

function notifySubscribers(post, postTitle, comment) {
  const postUrl = CONFIG.SITE_URL + '/blog/' + post + '.html';
  const subject = 'New comment on "' + postTitle + '"';
  const intro = comment.name + ' commented on "' + postTitle + '":';

  const recipients = rows(sheet('Subscribers', SUBSCRIBER_COLUMNS))
    .filter((r) => r[0] === post && r[3] === true)
    .map((r) => ({ email: String(r[1]), unsubscribeUrl: postUrl + '?unsubscribe=' + r[2] }));
  if (CONFIG.OWNER_EMAIL) recipients.push({ email: CONFIG.OWNER_EMAIL, unsubscribeUrl: null });

  recipients.forEach((to) => {
    const footer = to.unsubscribeUrl
      ? 'You get this email because you subscribed to the comments on this post.'
      : 'You get this email because you are the owner of the blog.';
    try {
      if (MailApp.getRemainingDailyQuota() < 1) return;
      MailApp.sendEmail({
        to: to.email,
        name: CONFIG.SENDER_NAME,
        subject: subject,
        body:
          intro + '\n\n' + comment.title + '\n\n' + comment.text + '\n\n' +
          'Read the discussion: ' + postUrl + '#comments\n\n' +
          footer + (to.unsubscribeUrl ? '\nUnsubscribe: ' + to.unsubscribeUrl : ''),
        htmlBody:
          '<p>' + escapeHtml(intro) + '</p>' +
          '<blockquote style="margin:0;padding:0 0 0 14px;border-left:3px solid #7877c6">' +
          '<p><strong>' + escapeHtml(comment.title) + '</strong></p>' +
          '<p style="white-space:pre-wrap">' + escapeHtml(comment.text) + '</p>' +
          '</blockquote>' +
          '<p><a href="' + postUrl + '#comments">Read the discussion</a></p>' +
          '<p style="color:#777;font-size:12px">' + footer +
          (to.unsubscribeUrl ? ' <a href="' + to.unsubscribeUrl + '">Unsubscribe</a>' : '') + '</p>',
      });
    } catch (err) {
      console.error('Could not email ' + to.email + ': ' + err);
    }
  });
}

// ── Subscriptions ───────────────────────────────────────────────────────────

// A subscription only becomes active once the address owner clicks the link in
// the confirmation email, so nobody can sign up someone else. The answer is the
// same whether or not the address was already subscribed.
function subscribe(req) {
  const post = req.post;
  const postTitle = checkPost(post);
  const email = String(req.email || '').trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/.test(email)) {
    fail('Please enter a valid email address.');
  }

  const token = withLock(() => {
    const sh = sheet('Subscribers', SUBSCRIBER_COLUMNS);
    const existing = rows(sh).find((r) => r[0] === post && r[1] === email);
    if (existing && existing[3] === true) return null;

    // One confirmation email per address and post every ten minutes.
    const cache = CacheService.getScriptCache();
    const recent = 'confirmation:' + post + ':' + email;
    if (cache.get(recent)) return null;
    throttle('confirmations', CONFIG.MAX_CONFIRMATION_EMAILS_PER_HOUR);
    cache.put(recent, '1', 600);

    if (existing) return existing[2];
    const fresh = Utilities.getUuid();
    sh.appendRow([asText(post), asText(email), fresh, false, asText(new Date().toISOString())]);
    return fresh;
  });

  if (token) {
    const confirmUrl = CONFIG.SITE_URL + '/blog/' + post + '.html?confirm=' + token;
    const line = 'Confirm that you want an email when a new comment is added to "' + postTitle + '".';
    const ignore = 'If you did not ask for this, ignore this email and you will not hear from us again.';
    MailApp.sendEmail({
      to: email,
      name: CONFIG.SENDER_NAME,
      subject: 'Confirm your subscription to the comments on "' + postTitle + '"',
      body: line + '\n\nConfirm: ' + confirmUrl + '\n\n' + ignore,
      htmlBody:
        '<p>' + escapeHtml(line) + '</p>' +
        '<p><a href="' + confirmUrl + '">Confirm subscription</a></p>' +
        '<p style="color:#777;font-size:12px">' + ignore + '</p>',
    });
  }
  return {};
}

function confirmSubscription(req) {
  return withLock(() => {
    const sh = sheet('Subscribers', SUBSCRIBER_COLUMNS);
    const index = findToken(sh, req.token);
    if (index < 0) fail('This confirmation link is no longer valid. Please subscribe again.');
    sh.getRange(index + 2, 4).setValue(true);
    return {};
  });
}

function unsubscribe(req) {
  return withLock(() => {
    const sh = sheet('Subscribers', SUBSCRIBER_COLUMNS);
    const index = findToken(sh, req.token);
    if (index >= 0) sh.deleteRow(index + 2);
    return {};
  });
}

function findToken(sh, token) {
  if (typeof token !== 'string' || !token) return -1;
  return rows(sh).findIndex((r) => r[2] === token);
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function respond(handler) {
  try {
    return json(Object.assign({ ok: true }, handler()));
  } catch (err) {
    if (!err.forUser) console.error(err);
    return json({ ok: false, error: err.forUser ? err.message : 'Something went wrong. Please try again later.' });
  }
}

function json(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

// An error whose message is safe to show to the visitor.
function fail(message) {
  const err = new Error(message);
  err.forUser = true;
  throw err;
}

function withLock(work) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    return work();
  } finally {
    lock.releaseLock();
  }
}

// Get a tab of the spreadsheet, creating it with its header row on first use.
function sheet(name, columns) {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  let sh = book.getSheetByName(name);
  if (!sh) {
    sh = book.insertSheet(name);
    sh.appendRow(columns);
    sh.setFrozenRows(1);
  }
  return sh;
}

function rows(sh) {
  return sh.getDataRange().getValues().slice(1);
}

// Count an event against an hourly ceiling shared by all visitors.
function throttle(key, max) {
  const cache = CacheService.getScriptCache();
  const bucket = key + ':' + Math.floor(Date.now() / 3600000);
  const used = Number(cache.get(bucket) || 0);
  if (used >= max) fail('The blog is getting a lot of requests right now. Please try again later.');
  cache.put(bucket, String(used + 1), 3600);
}

function checkSlug(slug) {
  if (typeof slug !== 'string' || !/^[a-z0-9][a-z0-9-]{0,80}$/.test(slug)) fail('Unknown post.');
}

// Check a post against the list the site publishes, and return its title. If
// the list cannot be fetched the post is accepted and its slug stands in for
// the title.
function checkPost(slug) {
  checkSlug(slug);
  let posts = publishedPosts(false);
  if (posts && !posts.hasOwnProperty(slug)) posts = publishedPosts(true);
  if (!posts) return slug;
  if (!posts.hasOwnProperty(slug)) fail('Unknown post.');
  return posts[slug];
}

function publishedPosts(refresh) {
  const cache = CacheService.getScriptCache();
  const cached = refresh ? null : cache.get('posts');
  if (cached) return JSON.parse(cached);
  try {
    const res = UrlFetchApp.fetch(CONFIG.SITE_URL + '/blog/posts.json', { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) return null;
    const posts = {};
    JSON.parse(res.getContentText()).forEach((p) => { posts[p.slug] = String(p.title); });
    cache.put('posts', JSON.stringify(posts), 600);
    return posts;
  } catch (err) {
    return null;
  }
}

// Trim, and remove control characters; a single-line field also loses its
// line breaks.
function clean(value, singleLine) {
  let s = String(value == null ? '' : value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  s = s.replace(/\r\n?/g, '\n');
  if (singleLine) s = s.replace(/\s+/g, ' ');
  return s.trim();
}

// A leading apostrophe makes Sheets store the value as plain text, so a comment
// that starts with "=" is not run as a formula and "1/2" is not turned into a
// date. The apostrophe is not part of the stored value.
function asText(value) {
  return "'" + value;
}

// The "hidden" column: a ticked checkbox or any text hides the comment.
function isHidden(value) {
  return value === true || (typeof value === 'string' && value.trim() !== '');
}

function isoDate(value) {
  return value instanceof Date ? value.toISOString() : String(value);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
