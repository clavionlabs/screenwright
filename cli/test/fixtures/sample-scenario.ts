import type { ScreenwrightHelpers } from 'screenwright';

export default async function scenario(sw: ScreenwrightHelpers) {
  await sw.scene('Signing In');
  await sw.navigate('http://localhost:3000/login', {
    narration: "Let's start by logging into the dashboard.",
  });

  await sw.fill('[data-testid="email"]', 'sarah@acme.co', {
    narration: 'Enter our email address.',
  });

  await sw.fill('[data-testid="password"]', 'SecurePass123');
  await sw.click('[data-testid="login-btn"]', {
    narration: 'Click sign in.',
  });

  await sw.scene('Viewing the Dashboard');
  await sw.narrate('The dashboard shows our key metrics at a glance.');
}
