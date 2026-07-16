// Iconos por categoría — trazos tipo Lucide, en línea.
//
// Existen porque el sistema de Chidori/Sombra prohíbe emoji: "la marca es
// severa y seca; los emoji rompen el registro". Un 📺 en una cifra de plata
// la hace ver de juguete, y esta herramienta necesita que le creas.

const P = (d) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;

export const ICONOS = {
  streaming: P('<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>'),
  musica:    P('<path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>'),
  ia:        P('<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M15 2v2M9 2v2M15 20v2M9 20v2M20 15h2M20 9h2M2 15h2M2 9h2"/>'),
  software:  P('<path d="M17.5 19a4.5 4.5 0 1 0 0-9h-1.8A7 7 0 1 0 4 16.7"/><path d="M12 12v9M8 17l4-4 4 4"/>'),
  domicilios:P('<circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M15 17.5h-9l-1-9H3M6.5 8.5h8l2 9"/>'),
  gimnasio:  P('<path d="M14.4 14.4 9.6 9.6M18.657 21.485a2 2 0 1 1-2.829-2.828l-1.767 1.768a2 2 0 1 1-2.829-2.829l6.364-6.364a2 2 0 1 1 2.829 2.829l1.767-1.768a2 2 0 1 1 2.829 2.829z" transform="scale(0.78) translate(3 -1)"/><path d="m21.5 21.5-1.4-1.4M3.9 3.9 2.5 2.5"/><path d="M6.404 12.768a2 2 0 1 1-2.829-2.829l1.768 1.768a2 2 0 1 1 2.828-2.829l6.364 6.364a2 2 0 1 1-2.828 2.829l1.767 1.767a2 2 0 1 1-2.828 2.829z" transform="scale(0.78) translate(-1 -4)"/>'),
  telco:     P('<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/>'),
  juegos:    P('<path d="M6 12h4M8 10v4M15 13h.01M18 11h.01"/><rect x="2" y="6" width="20" height="12" rx="4"/>'),
  educacion: P('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>'),
  otros:     P('<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>'),
  sospechosa:P('<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01"/>'),
};

export const iconoDe = (cat) => ICONOS[cat] || ICONOS.otros;
