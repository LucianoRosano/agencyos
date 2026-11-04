import { expect, test } from "@playwright/test";
import { expectNoHorizontalScroll, login, shot } from "./helpers";

const todayAR = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const addDays = (iso: string, n: number) => {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

test("Facultad: materia + evaluación en 6 días → cuenta regresiva en /facultad y en el calendario; iCal con token revocable @visual", async ({
  page,
}, info) => {
  const project = info.project.name;
  const course = `Int. a la Programación ${project}`;
  const exam = `Parcial 1 · ${course}`;
  const target = addDays(todayAR(), 6);
  page.on("dialog", (d) => void d.accept());

  await login(page);
  await page.goto("/facultad");
  await expectNoHorizontalScroll(page);
  if (await page.getByText("Todavía no cargaste materias").isVisible()) await shot(page, "facultad-vacia", project);

  // --- Materia ---
  await page.getByRole("button", { name: "Nueva materia" }).first().click();
  await page.fill("#name", course);
  await page.fill("#program", "Licenciatura en Sistemas · UNGS");
  await page.fill("#term", "2026 · 2.º cuatrimestre");
  await page.fill("#commission", "C3");
  await page.getByRole("button", { name: "Agregar horario" }).click();
  await page.getByLabel("Aula (horario 1)").fill("Aula 7");
  await page.getByRole("button", { name: "Crear materia" }).click();
  await page.waitForURL(/\/facultad\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: course })).toBeVisible();
  await expect(page.getByText("Aula 7")).toBeVisible();

  // --- Evaluación en 6 días ---
  await page.getByRole("button", { name: "Nueva evaluación" }).click();
  await page.fill("#title", "Parcial 1");
  await page.fill("#date", target);
  await page.fill("#time", "18:00");
  await page.fill("#targetGrade", "9");
  await page.fill("#topicsMd", "- Variables\n- Funciones\n- Recursión");
  await page.getByRole("button", { name: "Agendar evaluación" }).click();
  await expect(page.getByText("Evaluación agendada")).toBeVisible();
  await expect(page.getByText("6 días").first()).toBeVisible();

  // --- Plan de estudio: 3 tareas hasta la evaluación ---
  await page.getByRole("button", { name: "Armar plan de estudio" }).click();
  await page.getByRole("button", { name: "Crear tareas" }).click();
  await expect(page.getByText("Plan creado: 3 tareas")).toBeVisible();
  await expect(page.getByText("Plan de estudio · 0/3")).toBeVisible();
  await expect(page.getByText("Estudiar: Recursión")).toBeVisible();
  await expectNoHorizontalScroll(page);
  await shot(page, "facultad-materia", project);

  // --- /facultad: cuenta regresiva grande y avance ---
  await page.goto("/facultad");
  await expect(page.getByText("Próxima evaluación")).toBeVisible();
  await expect(page.getByText("6 días").first()).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(course) }).first()).toBeVisible();
  await expect(page.getByText("en 6 días").first()).toBeVisible();
  await expectNoHorizontalScroll(page);
  await shot(page, "facultad", project);

  // --- Calendario: mes (grilla en desktop, lista en el celular) ---
  await page.goto(`/calendario?vista=mes&fecha=${target}`);
  await expect(page.getByText(exam).filter({ visible: true }).first()).toBeVisible();
  await expectNoHorizontalScroll(page);
  await shot(page, "calendario-mes", project);

  // ocultar la fuente "Evaluaciones" (persistido en la URL) y volver a mostrarla
  await page.getByRole("link", { name: /^Evaluaciones/ }).click();
  await expect(page).toHaveURL(/ocultar=assessment/);
  await expect(page.getByText(exam).filter({ visible: true })).toHaveCount(0);
  await page.getByRole("link", { name: /^Evaluaciones/ }).click();
  await expect(page.getByText(exam).filter({ visible: true }).first()).toBeVisible();

  // --- Agenda ---
  await page.goto("/calendario?vista=agenda");
  await expect(page.getByText(exam).filter({ visible: true }).first()).toBeVisible();
  // crear una tarea desde el calendario
  await page.getByRole("button", { name: "Nuevo", exact: true }).click();
  await page.fill("#title", `Repasar apuntes ${project}`);
  await page.getByRole("button", { name: "Crear tarea" }).click();
  await expect(page.getByText("Tarea creada")).toBeVisible();
  await expect(page.getByText(`Repasar apuntes ${project}`).filter({ visible: true }).first()).toBeVisible();
  await expectNoHorizontalScroll(page);
  await shot(page, "calendario-agenda", project);

  // semana y día también renderizan
  await page.goto(`/calendario?vista=semana&fecha=${target}`);
  await expect(page.getByText(exam).filter({ visible: true }).first()).toBeVisible();
  await expectNoHorizontalScroll(page);
  await shot(page, "calendario-semana", project);
  await page.goto(`/calendario?vista=dia&fecha=${target}`);
  await expect(page.getByText(exam).filter({ visible: true }).first()).toBeVisible();
  await expectNoHorizontalScroll(page);

  // --- iCal: generar, leer sin sesión, revocar ---
  await page.getByRole("button", { name: "Suscribirme desde el celular" }).click();
  await page.getByRole("button", { name: /^Generar URL/ }).click();
  const url = await page.locator("#ical-url").inputValue();
  expect(url).toMatch(/\/api\/calendario\/ical\/[A-Za-z0-9_-]{40,}$/);
  const anon = await page.request.get(url, { headers: { cookie: "" } });
  expect(anon.status()).toBe(200);
  expect(anon.headers()["content-type"]).toContain("text/calendar");
  const ics = await anon.text();
  expect(ics).toContain("BEGIN:VCALENDAR");
  expect(ics).toContain(`DTSTART;TZID=America/Buenos_Aires:${target.replaceAll("-", "")}T180000`);
  expect((await page.request.get(`${url.slice(0, -4)}XXXX`)).status()).toBe(404);
  await page.getByRole("button", { name: "Revocar" }).click();
  await expect(page.getByText("Suscripción revocada")).toBeVisible();
  expect((await page.request.get(url)).status()).toBe(404);
});
