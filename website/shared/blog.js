// Blog pages: the ledger toggle on narrow screens, and the comments section.
//
// Comments and subscriptions are stored by the Google Apps Script in
// website/comments-backend/. Paste the web app URL it gives you (it ends in
// /exec) here. While this is empty the comments section says it is unavailable.
const COMMENTS_API = '';

(function () {
  const ledger = document.getElementById('blog-ledger');
  const toggle = ledger && ledger.querySelector('.ledger-toggle');
  if (toggle) {
    toggle.addEventListener('click', () => {
      toggle.setAttribute('aria-expanded', String(ledger.classList.toggle('open')));
    });
  }

  const section = document.getElementById('comments');
  if (!section) return;

  const post = section.dataset.post;
  const heading = document.getElementById('comments-heading');
  const list = document.getElementById('comments-list');
  const notice = document.getElementById('comments-notice');
  const commentForm = document.getElementById('comment-form');
  const subscribeForm = document.getElementById('subscribe-form');
  let count = 0;

  if (!COMMENTS_API) {
    list.innerHTML = '<p class="comments-empty">Comments are not available yet.</p>';
    commentForm.hidden = true;
    subscribeForm.hidden = true;
    return;
  }

  // The body is sent as text/plain: Apps Script cannot answer the CORS
  // preflight that a JSON content type would trigger.
  async function send(payload) {
    const res = await fetch(COMMENTS_API, { method: 'POST', body: JSON.stringify(payload) });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
    return data;
  }

  function setStatus(form, text, isError) {
    const el = form.querySelector('.form-status');
    el.textContent = text;
    el.classList.toggle('error', Boolean(isError));
  }

  function showNotice(text) {
    notice.textContent = text;
    notice.hidden = false;
    section.scrollIntoView();
  }

  function setCount(n) {
    count = n;
    heading.textContent = n ? `Comments (${n})` : 'Comments';
  }

  // Comment fields are only ever set through textContent, never as HTML.
  function commentElement(c) {
    const el = document.createElement('article');
    el.className = 'comment';

    const title = document.createElement('h4');
    title.className = 'comment-title';
    title.textContent = c.title;

    const meta = document.createElement('p');
    meta.className = 'comment-meta';
    const name = document.createElement('span');
    name.className = 'comment-name';
    name.textContent = c.name;
    const time = document.createElement('time');
    const date = new Date(c.date);
    time.dateTime = c.date;
    time.title = date.toLocaleString();
    time.textContent = date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    meta.append(name, ' · ', time);

    const text = document.createElement('div');
    text.className = 'comment-text';
    text.textContent = c.text;

    el.append(title, meta, text);
    return el;
  }

  async function loadComments() {
    try {
      const res = await fetch(`${COMMENTS_API}?action=list&post=${encodeURIComponent(post)}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      list.replaceChildren(...data.comments.map(commentElement));
      setCount(data.comments.length);
      if (!data.comments.length) {
        list.innerHTML = '<p class="comments-empty">No comments yet. Be the first to comment.</p>';
      }
    } catch (err) {
      list.innerHTML = '<p class="comments-empty">The comments could not be loaded. Please try again later.</p>';
    }
  }

  commentForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = commentForm.querySelector('button');
    const fields = Object.fromEntries(new FormData(commentForm));
    button.disabled = true;
    setStatus(commentForm, 'Publishing…');
    try {
      const data = await send({ action: 'comment', post, ...fields });
      if (!count) list.replaceChildren();
      list.append(commentElement(data.comment));
      setCount(count + 1);
      commentForm.reset();
      setStatus(commentForm, 'Your comment was published.');
    } catch (err) {
      setStatus(commentForm, err.message, true);
    } finally {
      button.disabled = false;
    }
  });

  subscribeForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = subscribeForm.querySelector('button');
    button.disabled = true;
    setStatus(subscribeForm, 'Subscribing…');
    try {
      await send({ action: 'subscribe', post, email: subscribeForm.elements.email.value });
      subscribeForm.reset();
      setStatus(subscribeForm, 'Almost done: check your inbox and click the link to confirm your subscription.');
    } catch (err) {
      setStatus(subscribeForm, err.message, true);
    } finally {
      button.disabled = false;
    }
  });

  // Links in the emails lead back to the post with ?confirm=<token> or
  // ?unsubscribe=<token>.
  async function handleEmailLink() {
    const params = new URLSearchParams(location.search);
    const action = params.has('confirm') ? 'confirm' : params.has('unsubscribe') ? 'unsubscribe' : null;
    if (!action) return;
    const token = params.get(action);
    history.replaceState(null, '', location.pathname + '#comments');
    try {
      await send({ action, token });
      showNotice(
        action === 'confirm'
          ? 'Your subscription is confirmed. You will get an email when a new comment is added to this post.'
          : 'You are unsubscribed from the comments on this post.'
      );
    } catch (err) {
      showNotice(err.message);
    }
  }

  loadComments();
  handleEmailLink();
})();
