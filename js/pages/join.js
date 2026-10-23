import { supabase } from '../supabase.js';
import { showFlash, setFlash, flashFromStorage, redirectIfSignedIn, nextPage, param } from '../ui.js';

if (!(await redirectIfSignedIn())) {
  flashFromStorage();

  const loginLink = document.querySelector('a[href="login.html"]');
  if (loginLink && param('next')) loginLink.href = 'login.html?next=' + encodeURIComponent(nextPage());

  document.getElementById('signup-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const name = form.name.value.trim();
    const email = form.email.value.trim().toLowerCase();
    const password = form.password.value;

    if (!name || !email || !password) return showFlash('error', 'All fields required');
    if (password.length < 6) return showFlash('error', 'Password must be at least 6 characters');

    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;

    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { name } } });

    // Supabase hides "already registered" by returning a user with no identities
    const alreadyUsed = data && data.user && data.user.identities && data.user.identities.length === 0;
    if (error || alreadyUsed) {
      const msg = alreadyUsed || /already registered/i.test(error.message) ? 'Email already registered' : error.message;
      showFlash('error', msg);
      button.disabled = false;
      return;
    }

    if (data.session) {
      setFlash('success', `Welcome, ${name}!`);
      location.href = nextPage();
    } else {
      // "Confirm email" is switched on in Supabase: they must click the link in their inbox first
      setFlash('success', 'Account created! Check your email to confirm it, then log in.');
      location.href = param('next') ? 'login.html?next=' + encodeURIComponent(nextPage()) : 'login.html';
    }
  });
}
