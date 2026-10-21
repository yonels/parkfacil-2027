export default function manifest() {
  return {
    id: "/pos",
    name: "ParkFacil POS",
    short_name: "ParkFacil",
    description: "Terminal operacional ParkFacil",
    start_url: "/pos",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#ECEFF1",
    theme_color: "#455A64",
    lang: "es-CL",
    categories: ["business", "productivity"],
    icons: [
      {
        src: "/icons/parkfacil-pos.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icons/parkfacil-pos-maskable.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
