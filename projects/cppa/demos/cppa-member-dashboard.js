import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @param {import('screenwright').ScreenwrightHelpers} sw */
export default async function scenario(sw) {
  const BASE = 'https://app.cppa.care';

  // Credentials from environment
  const email = process.env.CPPA_TEST_EMAIL;
  const password = process.env.CPPA_TEST_PASSWORD;
  if (!email || !password) {
    throw new Error('Set CPPA_TEST_EMAIL and CPPA_TEST_PASSWORD environment variables');
  }

  // Load CPPA logo as data URL for title cards
  const logoBuffer = await readFile(resolve(__dirname, '../assets/cppa-logo.webp'));
  const logoDataUrl = `data:image/webp;base64,${logoBuffer.toString('base64')}`;

  // ─── Title Slide ───────────────────────────────────────────────

  await sw.scene('Conscious Physicians Psychedelic Academy', {
    description: 'Member Dashboard Overview',
    slide: {
      duration: 6000,
      brandColor: '#1E3A5F',
      textColor: '#FFFFFF',
      fontFamily: 'Inter',
      logoUrl: logoDataUrl,
      narrate: 'Welcome to the Conscious Physicians Psychedelic Academy. In this short walkthrough, I am going to show you how to use your member dashboard. We will look at your CEU credits, your sessions, and how to view and download your completion certificate. So let us get started.',
    },
  });
  await sw.transition({ type: 'fade', duration: 1000 });

  // ─── Login ─────────────────────────────────────────────────────

  await sw.scene('Signing In');
  await sw.navigate(`${BASE}/views/login`, {
    narration: 'To get to your dashboard, go to app dot cppa dot care in your web browser. You will see the sign-in page.',
  });
  await sw.wait(2500);

  await sw.click('input#email', {
    narration: 'Click on the email field.',
  });
  await sw.wait(800);

  await sw.fill('input#email', email, {
    narration: 'And type in the email address you registered with.',
  });
  await sw.wait(1500);

  await sw.click('input#password', {
    narration: 'Now click on the password field.',
  });
  await sw.wait(800);

  await sw.fill('input#password', password);
  await sw.wait(1200);

  await sw.click('button[type="submit"]', {
    narration: 'Then click Sign In.',
  });
  await sw.wait(4000); // Wait for dashboard to fully load

  // ─── Dashboard Overview ────────────────────────────────────────

  await sw.scene('Your Dashboard');
  await sw.transition({ type: 'fade', duration: 800 });

  await sw.narrate('And here we are. This is your member dashboard. It is your home base for everything related to your continuing education.');
  await sw.wait(3000);

  await sw.narrate('At the top, you will notice three summary cards. Let me walk you through each one.');
  await sw.wait(2000);

  // Highlight CEU Credits
  await sw.hover('p:has-text("Total CEU Credits")', {
    narration: 'This first card shows your Total CEU Credits. This is the total number of continuing education credits you have earned across all of your completed sessions.',
  });
  await sw.wait(3000);

  // Highlight Sessions Attended
  await sw.hover('p:has-text("Sessions Attended")', {
    narration: 'The second card shows Sessions Attended. This is simply how many sessions you have completed so far.',
  });
  await sw.wait(3000);

  // Highlight Upcoming Sessions
  await sw.hover('p:has-text("Upcoming Sessions")', {
    narration: 'And the third card shows your Upcoming Sessions, so you always know what is coming up next on your schedule.',
  });
  await sw.wait(3000);

  // ─── Next Session Card ─────────────────────────────────────────

  await sw.scene('Your Next Session');
  await sw.transition({ type: 'fade', duration: 600 });

  await sw.hover('h2:has-text("Next Session")', {
    narration: 'Below those cards, you will see a section called Next Session. This gives you the details for your next upcoming session, including the date, time, and who will be presenting.',
  });
  await sw.wait(3500);

  // ─── CEU Summary Table ─────────────────────────────────────────

  await sw.scene('Your CEU Summary');
  await sw.transition({ type: 'fade', duration: 600 });

  await sw.hover('h2:has-text("CEU Summary")', {
    narration: 'Now, if you scroll down a little further, you will find your CEU Summary. This is a complete record of every session you have completed.',
  });
  await sw.wait(3000);

  await sw.hover('table tbody tr:first-child', {
    narration: 'Each row shows you the date of the session, the session title, and the number of CEU credits you received. It is all right here in one place.',
  });
  await sw.wait(3500);

  // ─── Certificate Viewing ───────────────────────────────────────

  await sw.scene('Your Completion Certificate');
  await sw.transition({ type: 'doorway', duration: 1000 });

  await sw.narrate('Now. Here is the part I think you are really going to enjoy.');
  await sw.wait(2500);

  await sw.hover('button:has-text("View Certificate")', {
    narration: 'You see that button that says View Certificate? Go ahead and click on it.',
  });
  await sw.wait(2000);

  await sw.click('button:has-text("View Certificate")');
  await sw.wait(3000);

  await sw.narrate('There it is. Your official CEU Completion Certificate.');
  await sw.wait(3000);

  await sw.narrate('It has your name, the session you completed, the date, and the credits you earned. This is your proof of professional development, and it is yours to keep.');
  await sw.wait(4000);

  await sw.hover('button:has-text("Download")', {
    narration: 'To save a copy, just click this Download button right here. It will save as a PDF file to your computer. You can print it, email it, or keep it for your records.',
  });
  await sw.wait(3500);

  // Close the modal
  await sw.press('Escape');
  await sw.wait(1500);

  // ─── Closing Slide ─────────────────────────────────────────────

  await sw.transition({ type: 'fade', duration: 1000 });
  await sw.scene('You are all set.', {
    slide: {
      duration: 6000,
      brandColor: '#1E3A5F',
      textColor: '#FFFFFF',
      fontFamily: 'Inter',
      logoUrl: logoDataUrl,
      narrate: 'And that is everything. Your dashboard keeps all of your credits, sessions, and certificates in one place. If you ever have any questions, do not hesitate to reach out. We are here to help. Thank you for being a part of the Conscious Physicians Psychedelic Academy.',
    },
  });

  // Fade to black
  await sw.transition({ type: 'fade', duration: 2000 });
  await sw.scene('', {
    slide: { brandColor: '#000000' },
  });
}
