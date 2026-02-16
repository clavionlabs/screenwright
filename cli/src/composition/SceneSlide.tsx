import React, { useEffect, useState } from 'react';
import { delayRender, continueRender } from 'remotion';

/* Minimal DOM types — this file only runs in Remotion's browser context. */
declare const document: {
  createElement(tag: string): HTMLLinkElement;
  head: { appendChild(el: unknown): void; removeChild(el: unknown): void };
  fonts: { ready: Promise<void> };
};

interface HTMLLinkElement {
  rel: string;
  href: string;
  onload: (() => void) | null;
  onerror: (() => void) | null;
}

interface Props {
  title: string;
  description?: string;
  brandColor: string;
  textColor: string;
  fontFamily?: string;
  titleFontSize?: number;
}

const SYSTEM_FONTS = 'system-ui, -apple-system, sans-serif';
const FONT_TIMEOUT_MS = 5000;

export const SceneSlide: React.FC<Props> = ({
  title,
  description,
  brandColor,
  textColor,
  fontFamily,
  titleFontSize = 64,
}) => {
  const [handle] = useState(() => fontFamily ? delayRender('Loading font') : null);

  useEffect(() => {
    if (!fontFamily || !handle) return;

    const encoded = encodeURIComponent(fontFamily);
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${encoded}&display=swap`;

    const timeout = setTimeout(() => {
      console.warn(`Font "${fontFamily}" timed out after ${FONT_TIMEOUT_MS}ms, using fallback`);
      continueRender(handle);
    }, FONT_TIMEOUT_MS);

    link.onload = () => {
      document.fonts.ready.then(() => {
        clearTimeout(timeout);
        continueRender(handle);
      });
    };

    link.onerror = () => {
      console.warn(`Failed to load font "${fontFamily}", using fallback`);
      clearTimeout(timeout);
      continueRender(handle);
    };

    document.head.appendChild(link);
    return () => {
      clearTimeout(timeout);
      document.head.removeChild(link);
    };
  }, [fontFamily, handle]);

  const resolvedFont = fontFamily ? `"${fontFamily}", ${SYSTEM_FONTS}` : SYSTEM_FONTS;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: brandColor,
        fontFamily: resolvedFont,
      }}
    >
      <div
        style={{
          textAlign: 'center',
          padding: '0 10%',
        }}
      >
        <h1
          style={{
            color: textColor,
            fontSize: titleFontSize,
            fontWeight: 700,
            margin: 0,
            lineHeight: 1.2,
          }}
        >
          {title}
        </h1>
        {description && (
          <>
            <div
              style={{
                width: 80,
                height: 4,
                backgroundColor: textColor,
                opacity: 0.4,
                margin: '24px auto',
                borderRadius: 2,
              }}
            />
            <p
              style={{
                color: textColor,
                fontSize: Math.round(titleFontSize * 0.44),
                fontWeight: 400,
                margin: 0,
                opacity: 0.85,
                lineHeight: 1.5,
              }}
            >
              {description}
            </p>
          </>
        )}
      </div>
    </div>
  );
};
