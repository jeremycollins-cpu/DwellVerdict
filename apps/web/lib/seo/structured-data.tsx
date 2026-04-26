/**
 * Renders a `<script type="application/ld+json">` tag with the
 * given schema object. Use `dangerouslySetInnerHTML` rather than
 * children because the JSON contains characters React would
 * escape (and search engines don't parse escaped JSON-LD).
 */
export function StructuredData({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
