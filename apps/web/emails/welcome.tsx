import { Button, Heading, Hr, Section, Text } from "@react-email/components";

import { EmailLayout } from "./_layout";

interface WelcomeEmailProps {
  name?: string;
}

/**
 * First touch after signup. Wired into M3.4's onboarding flow — for
 * M0.1 it's only used by the smoke-test endpoint.
 *
 * Voice is intentionally direct + personal. Marketing emails feel
 * like marketing emails; this should read like a note from a person.
 */
export function WelcomeEmail({ name }: WelcomeEmailProps) {
  return (
    <EmailLayout preview="Welcome to DwellVerdict — let's get you started">
      <Heading className="m-0 text-2xl font-bold tracking-tight text-ink">
        Welcome to DwellVerdict
      </Heading>

      <Text className="mt-3 text-base leading-relaxed text-ink">
        {name ? `Hi ${name},` : "Hi,"}
      </Text>

      <Text className="mt-2 text-base leading-relaxed text-ink">
        You&apos;re set up. DwellVerdict gives you a verdict on any property in
        seconds — buy, watch, or pass — backed by real data on regulations,
        location, comps, and revenue potential.
      </Text>

      <Section className="mt-6">
        <Button
          href="https://dwellverdict.com/app/properties"
          className="rounded-md bg-terracotta px-5 py-3 text-sm font-medium text-white"
        >
          Run your first verdict
        </Button>
      </Section>

      <Hr className="my-8 border-hairline" />

      <Text className="text-sm leading-relaxed text-ink-muted">
        Questions? Reply to this email — it goes straight to my inbox.
      </Text>

      <Text className="mt-2 text-sm leading-relaxed text-ink-muted">
        — Jeremy, founder of DwellVerdict
      </Text>
    </EmailLayout>
  );
}

export default WelcomeEmail;
