import { supabase } from '../supabase.js';
import { showFlash, flashFromStorage, redirectIfSignedIn, nextPage, param } from '../ui.js';

if (!(await redirectIfSignedIn())) {
  flashFromStorage();

  // Keep the invite link / page the person came from when they switch to sign up
  const signupLink = document.querySelector('a[href="signup.html"]');
  if (signupLink && param('next')) signupLink.href = 'signup.html?next=' + encodeURIComponent(nextPage());

  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const button = form.querySelector('button[type="submit"]');
    const label = button.textContent;
    button.disabled = true;
    button.textContent = 'Signing in...';

    let error = null;
    try {
      // give up after 15 seconds instead of spinning forever
      const result = await Promise.race([
        supabase.auth.signInWithPassword({
          email: form.email.value.trim().toLowerCase(),
          password: form.password.value,
        }),
        new Promise((resolve) => setTimeout(() => resolve({ error: { message: 'This is taking too long. Check your internet and try again.' } }), 15000)),
      ]);
      error = result.error;
    } catch (err) {
      console.error(err);
      error = { message: 'Could not reach the server. Check your internet and try again.' };
    }

    if (error) {
      showFlash('error', error.message === 'Invalid login credentials' ? 'Incorrect email or password' : error.message);
      button.disabled = false;
      button.textContent = label;
      return;
    }
    location.href = nextPage();
  });
}