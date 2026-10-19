import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Job Agent | AI Job Search", description: "Personal job discovery and application workspace" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
