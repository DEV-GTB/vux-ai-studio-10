// Username and customization handling
const usernameForm = document.getElementById('username-form');
const usernameInput = document.getElementById('username-input');
const optionButtons = document.querySelectorAll('.option-btn');

let selectedVibe = 'Fast launch';

optionButtons.forEach((button) => {
  button.addEventListener('click', () => {
    optionButtons.forEach((btn) => btn.classList.remove('active'));
    button.classList.add('active');
    selectedVibe = button.dataset.vibe;
  });
});

if (usernameForm) {
  usernameForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const username = usernameInput.value.trim();
    if (username) {
      localStorage.setItem('vux_username', username);
      localStorage.setItem('vux_vibe', selectedVibe);
      localStorage.setItem('vux_onboarded', 'true');
      window.location.href = '/index.html';
    }
  });
}