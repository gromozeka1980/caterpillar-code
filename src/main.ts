import './style.css';
import { supabase } from './supabase';
import { init } from './game';

// After OAuth redirect, Supabase puts tokens in the URL hash.
// Let Supabase process them, save session, then reload without hash.
if (window.location.hash.includes('access_token') && supabase) {
  supabase.auth.getSession().then(() => {
    window.location.replace(window.location.pathname + window.location.search);
  });
} else {
  init();
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js');
}
