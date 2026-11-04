# ADR 0009 · Ajustes de tokens para cumplir WCAG AA

**Estado:** aceptada · 04/11/2026

axe (en los e2e) marcó contraste insuficiente con algunos tokens del contexto C1. Cambios mínimos, sin alterar la identidad:
- Nuevo `--text-faint` (no estaba en C1): oscuro `#7A8396`, claro `#636B7D`.
- Nuevo `--accent-text` para **texto** en color de acento (oscuro `#9B85FF`, claro `#5B3DF5`); fondos, gradiente y bordes siguen usando Plasma `#7C5CFF`.
- Tema claro: `--success #047857`, `--warning #9A4508`, `--danger #BE123C` (antes `#059669`, `#B45309`, `#E11D48`) para leerse sobre sus fondos suaves.
El tema oscuro (principal) conserva los valores de C1.
