// Served only by the local development server; scripts/ is excluded from dist/.
function installTestLogin(credentials) {
  const form = document.querySelector('#login');
  if (!form) return;
  const submit = form.querySelector(
    'button[type="submit"], button:not([type])',
  );
  const button = document.createElement('button');
  button.id = 'test-login';
  button.type = 'button';
  button.textContent = '測試帳號一鍵登入（僅本機）';
  const actions = document.createElement('div');
  actions.className = 'actions';
  actions.append(button);
  form.append(actions);
  new MutationObserver(() => {
    button.disabled = submit.disabled;
  }).observe(submit, { attributes: true, attributeFilter: ['disabled'] });
  button.addEventListener('click', () => {
    if (submit.disabled) return;
    form.elements.email.value = credentials.email;
    form.elements.password.value = credentials.password;
    form.requestSubmit(submit);
  });
}

export function injectTestLogin(html, env = process.env) {
  if (!env.TEST_EMAIL || !env.TEST_PASSWORD) return html;
  const credentials = JSON.stringify({
    email: env.TEST_EMAIL,
    password: env.TEST_PASSWORD,
  })
    .replaceAll('<', '\\u003c')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');
  return html.replace(
    '</body>',
    `<script type="module">(${installTestLogin.toString()})(${credentials});</script></body>`,
  );
}
