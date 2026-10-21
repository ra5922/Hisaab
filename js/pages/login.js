import { supabase } from '../supabase.js';
import { showFlash, flashFromStorage, redirectIfSignedIn } from '../ui.js';

if (!(await redirectIfSignedIn())) {
  flashFromStorage();

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
    location.href = 'groups.html';
  });
}
