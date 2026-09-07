# ADR 002 — Development Builds

Aceito. O módulo próprio exige expo-dev-client. Desenvolvimento completo usa builds locais
Android/iOS, sem dependência de EAS. Expo Go serve UI e SQLite enquanto compatíveis;
falta de módulo é tratada explicitamente pelo adapter. Mudanças nativas exigem reconstruir o app.
