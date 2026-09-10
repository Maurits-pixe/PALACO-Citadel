const form = document.querySelector('#goal-form');
const input = document.querySelector('#goal');
const output = document.querySelector('#goal-output');

form?.addEventListener('submit', (event) => {
  event.preventDefault();
  const goal = input?.value.trim();
  if (!goal) return;

  output.textContent = `PALACO objective set: ${goal}`;
  localStorage.setItem('palaco-goal', goal);
  form.reset();
});

const previousGoal = localStorage.getItem('palaco-goal');
if (previousGoal && output) {
  output.textContent = `Latest objective: ${previousGoal}`;
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'));
}
