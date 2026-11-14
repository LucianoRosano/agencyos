import type { Metadata } from "next";

export const metadata: Metadata = { title: "Términos · Luciano Rosano" };

export default function TermsPage() {
  return (
    <>
      <h1>Términos de uso</h1>
      <p>Última actualización: noviembre de 2026.</p>
      <h2>Qué es esto</h2>
      <p>
        Esta herramienta la usa Luciano Rosano para compartir con sus clientes presupuestos, el avance de los proyectos, entregas para aprobar y archivos. El
        acceso es personal: solo entrás con un enlace o una cuenta que te mandó Luciano.
      </p>
      <h2>Presupuestos y aprobaciones</h2>
      <ul>
        <li>Aceptar un presupuesto en línea equivale a aceptarlo por escrito: queda registrado el nombre de quien firma, la fecha, la IP y el navegador.</li>
        <li>El presupuesto vale hasta la fecha de validez que figura en él. Precios, plazos y formas de pago son los del documento.</li>
        <li>Aprobar una entrega o pedir cambios desde el portal queda registrado de la misma forma.</li>
      </ul>
      <h2>Tus responsabilidades</h2>
      <ul>
        <li>No compartas tus enlaces ni tu contraseña. Si creés que alguien más entró, avisale a Luciano para revocar el acceso.</li>
        <li>Los textos, imágenes y materiales que subas tienen que ser tuyos o tener permiso para usarlos.</li>
      </ul>
      <h2>Disponibilidad</h2>
      <p>
        Se hace lo posible para que el servicio esté siempre disponible y con copias de seguridad cifradas, pero puede haber interrupciones por mantenimiento.
        Ante cualquier problema, la vía de contacto es la de siempre con Luciano.
      </p>
      <h2>Cambios</h2>
      <p>Si estos términos cambian, se actualiza la fecha de arriba. Seguir usando la herramienta implica aceptar la versión vigente.</p>
    </>
  );
}
