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
    button.disabled = true;

    const { error } = await supabase.auth.signInWithPassword({
      email: form.email.value.trim().toLowerCase(),
      password: form.password.value,
    });

    if (error) {
      showFlash('error', error.message === 'Invalid login credentials' ? 'Incorrect email or password' : error.message);
      button.disabled = false;
      return;
    }
    location.href = nextPage();
  });
}
