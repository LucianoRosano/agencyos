import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacidad · Luciano Rosano" };

export default function PrivacyPage() {
  return (
    <>
      <h1>Política de privacidad</h1>
      <p>Última actualización: noviembre de 2026.</p>
      <h2>Responsable</h2>
      <p>
        Luciano Rosano, Buenos Aires, Argentina, es responsable de los datos que se tratan en esta herramienta, conforme a la Ley 25.326 de Protección de los
        Datos Personales.
      </p>
      <h2>Qué datos se guardan</h2>
      <ul>
        <li>Datos de contacto (nombre, email, teléfono) y de la empresa que nos diste para trabajar juntos.</li>
        <li>Lo que surge del trabajo: presupuestos, proyectos, entregas, comentarios y archivos compartidos.</li>
        <li>Registros técnicos de seguridad: fecha, IP y navegador al iniciar sesión o al aceptar un presupuesto.</li>
      </ul>
      <h2>Para qué se usan</h2>
      <p>
        Solo para prestarte el servicio contratado, comunicarnos y cumplir obligaciones legales y fiscales. No se venden ni se ceden a terceros con fines
        comerciales, y no hay publicidad ni rastreadores de terceros.
      </p>
      <h2>Dónde se guardan</h2>
      <p>
        En un servidor propio con conexión cifrada (HTTPS), contraseñas protegidas con hash y verificación en dos pasos para el equipo. Las copias de seguridad
        se guardan cifradas. El envío de emails puede pasar por un proveedor de correo (Brevo) solo para hacerte llegar los mensajes.
      </p>
      <h2>Tus derechos</h2>
      <p>
        Podés pedir acceso, rectificación o eliminación de tus datos escribiéndole a Luciano. La Agencia de Acceso a la Información Pública, órgano de control
        de la Ley 25.326, atiende denuncias y reclamos de quienes consideren vulnerados sus derechos.
      </p>
      <h2>Cuánto tiempo</h2>
      <p>Mientras dure la relación de trabajo y luego el tiempo que exijan las obligaciones legales y fiscales.</p>
    </>
  );
}
