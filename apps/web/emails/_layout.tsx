import {
  Body,
  Container,
  Font,
  Head,
  Html,
  Tailwind,
} from "@react-email/components";
import type { ReactNode } from "react";

/**
 * Base layout for every transactional email DwellVerdict sends.
 *
 * Brand-token note: React Email runs at send-time outside the Next
 * bundler, so it can't import from `apps/web/lib/brand-tokens.ts`.
 * The colors here are intentional duplicates of the canonical token
 * values — keep them in sync if brand tokens ever shift. Source of
 * truth lives in `apps/web/lib/brand-tokens.ts`.
 */

interface EmailLayoutProps {
  /** Inbox preview text (Gmail / Apple Mail snippet). Always set this. */
  preview?: string;
  children: ReactNode;
}

export function EmailLayout({ preview, children }: EmailLayoutProps) {
  return (
    <Html>
      <Head>
        <Font
          fontFamily="Geist"
          fallbackFontFamily="Helvetica"
          webFont={{
            url: "https://fonts.gstatic.com/s/geist/v3/gyByhwUxId8gMEwYGFU2.woff2",
            format: "woff2",
          }}
          fontWeight={400}
          fontStyle="normal"
        />
      </Head>
      <Tailwind
        config={{
          theme: {
            extend: {
              colors: {
                paper: "#fafaf7",
                "paper-warm": "#f5f2ec",
                ink: "#1c1917",
                "ink-muted": "#78716c",
                terracotta: "#c55a3f",
                "terracotta-deep": "#a8472f",
                hairline: "rgba(28, 25, 23, 0.07)",
              },
            },
          },
        }}
      >
        <Body className="bg-paper-warm font-sans">
          {preview ? (
            <div
              style={{
                display: "none",
                overflow: "hidden",
                lineHeight: "1px",
                opacity: 0,
                maxHeight: 0,
                maxWidth: 0,
              }}
            >
              {preview}
            </div>
          ) : null}
          <Container className="mx-auto my-10 max-w-[560px] rounded-lg border border-hairline bg-white p-10 shadow-sm">
            {children}
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}
