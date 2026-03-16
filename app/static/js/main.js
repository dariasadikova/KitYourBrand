document.addEventListener('DOMContentLoaded', () => {
  const demoButton = document.querySelector('.btn-hero');
  if (demoButton) {
    demoButton.addEventListener('click', (event) => {
      event.preventDefault();
    });
  }
});
