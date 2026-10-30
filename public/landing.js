document.addEventListener('DOMContentLoaded', () => {
  const signUpLink = document.querySelector('a[href="/username.html"]');
  if (signUpLink) {
    signUpLink.addEventListener('click', (event) => {
      event.preventDefault();
      window.location.href = '/username.html';
    });
  }
});