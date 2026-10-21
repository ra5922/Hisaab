import { supabase } from '../supabase.js';
import { requireUser, showFlash, setFlash, flashFromStorage } from '../ui.js';

async function main() {
  const ctx = await requireUser();
  if (!ctx) return;
  flashFromStorage();

  document.getElementById('group-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const name = form.name.value.trim();
    if (!name) return showFlash('error', 'Group name is required');

    const emails = form.members.value
      .split(/[,;\s]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;

    const { data, error } = await supabase.rpc('create_group', {
      p_name: name,
      p_category: form.category.value,
      p_member_emails: emails,
    });

    if (error) {
      console.error(error);
      showFlash('error', 'Could not create group');
      button.disabled = false;
      return;
    }

    const missing = (data && data.missing) || [];
    if (missing.length > 0) {
      setFlash('error', `Group "${name}" created, but these people have not signed up yet: ${missing.join(', ')}`);
    } else {
      setFlash('success', `Group "${name}" created!`);
    }
    location.href = `group.html?id=${data.group_id}`;
  });
}

main();
