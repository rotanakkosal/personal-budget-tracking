export const metadata = {
  title: "Personal Budget Tracker — KRW ⇄ USD",
  description: "Track income and expenses with KRW→USD conversion, local storage, and JSON import/export."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}