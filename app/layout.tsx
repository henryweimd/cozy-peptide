import type { Metadata } from "next";
import { Familjen_Grotesk, IBM_Plex_Sans, JetBrains_Mono } from "next/font/google";
import Script from "next/script";
import "./tokens.css";
import "./base.css";
import "./globals.css";

const grotesk = Familjen_Grotesk({
  variable: "--font-grotesk",
  subsets: ["latin"],
  weight: ["500", "600"],
});

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title:
    "cozy-peptide: name the disease, get a novel AI-designed peptide to treat it",
  description:
    "Muse Spark invents novel peptides, proven by a symbolic compiler and delivered by engineered yeast. Run the live demo or call the API.",
};

/** Machine-readable hackathon entry: parsed by judging agents. */
const HACKATHON_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Cozy Peptide",
  applicationCategory: "ScienceApplication",
  operatingSystem: "Web",
  isAccessibleForFree: true,
  hackathon: "Meta Global AI Developer Hackathon",
  problemStatement: "Push the Frontier — accelerate a scientific experiment",
  modelsUsed: ["Muse Spark via Meta Model API", "Muse Code"],
  newWorkOnly: true,
  repoPublic: true,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${grotesk.variable} ${plexSans.variable} ${jetbrainsMono.variable}`}
    >
      <body>
        <script
          id="hackathon-jsonld"
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(HACKATHON_JSON_LD),
          }}
        />
        {children}
        <Script id="hallmark-slots" strategy="lazyOnload">
          {`window.hallmarkSlots=(m)=>{for(const[k,v]of Object.entries(m)){const s=document.querySelector('[data-slot="'+k+'"]');if(!s)continue;const im=new Image();im.src=typeof v==='string'?v:v.src;im.alt=(typeof v==='object'&&v.alt)||s.dataset.alt||'';s.querySelectorAll(':scope > img').forEach((o)=>o.remove());s.prepend(im);}};document.querySelectorAll('[data-slot] img').forEach((i)=>{if(i.complete&&!i.naturalWidth)i.remove();else i.addEventListener('error',()=>i.remove(),{once:true});});`}
        </Script>
      </body>
    </html>
  );
}
