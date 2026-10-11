// Completes a popup sign-in: hands the one-time ticket (or the error) to the widget that opened this window, on the
// widget's own origin only, then closes. The ticket is useless without the nonce the widget holds.
(function () {
  var params = new URLSearchParams(location.hash.slice(1));
  history.replaceState(null, '', location.pathname);
  var payload = params.get('ticket') ? { ticket: params.get('ticket') } : { error: params.get('error') || 'failed' };
  if (window.opener && !window.opener.closed) {
    window.opener.postMessage({ discuss: { signIn: payload } }, location.origin);
    window.close();
  }
  document.getElementById('message').textContent = payload.ticket ? 'You are signed in. You can close this window.' : 'Sign-in did not complete. You can close this window and try again.';
})();
