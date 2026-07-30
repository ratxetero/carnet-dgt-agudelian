-- Esquema de la base de datos para el simulador de examen teórico DGT
-- Motor: SQLite (better-sqlite3)

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- Usuarios
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuarios (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    username        TEXT NOT NULL UNIQUE,
    email           TEXT NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    creado_en       TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- Temas oficiales del temario DGT — estructura de 11 temas principales según
-- el manual real (con subtemas para una clasificación más fina; el usuario
-- ve los 11 temas principales, los subtemas son un detalle interno/opcional).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS temas (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    numero          INTEGER NOT NULL,
    nombre          TEXT NOT NULL,
    descripcion     TEXT,
    carnet          TEXT NOT NULL DEFAULT 'B',
    UNIQUE(numero, carnet)
);

CREATE TABLE IF NOT EXISTS subtemas (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    tema_id         INTEGER NOT NULL REFERENCES temas(id) ON DELETE CASCADE,
    numero          TEXT NOT NULL,
    nombre          TEXT NOT NULL,
    UNIQUE(tema_id, numero)
);

-- ---------------------------------------------------------------------------
-- Preguntas
-- tema_id puede ser NULL porque el dataset de origen (anki-carnet-conducir)
-- no clasifica las preguntas por tema; se puede asignar a posteriori.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS preguntas (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    tema_id         INTEGER REFERENCES temas(id) ON DELETE SET NULL,
    subtema_id      INTEGER REFERENCES subtemas(id) ON DELETE SET NULL,
    carnet          TEXT NOT NULL DEFAULT 'B',
    enunciado       TEXT NOT NULL,
    imagen          TEXT,
    explicacion     TEXT,
    origen          TEXT,
    creado_en       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_preguntas_tema ON preguntas(tema_id);
CREATE INDEX IF NOT EXISTS idx_preguntas_carnet ON preguntas(carnet);

-- ---------------------------------------------------------------------------
-- Opciones de respuesta de cada pregunta.
-- Se usan siempre EXACTAMENTE 3 opciones por pregunta (a, b, c), igual que
-- en el examen oficial real de la DGT y en el dataset de origen.
-- Cada opción tiene su PROPIA explicación (por qué es correcta o incorrecta),
-- no solo una explicación general de la pregunta.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS opciones (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    pregunta_id     INTEGER NOT NULL REFERENCES preguntas(id) ON DELETE CASCADE,
    texto           TEXT NOT NULL,
    es_correcta     INTEGER NOT NULL DEFAULT 0 CHECK (es_correcta IN (0,1)),
    explicacion     TEXT NOT NULL DEFAULT '',
    orden           INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_opciones_pregunta ON opciones(pregunta_id);

-- ---------------------------------------------------------------------------
-- Exámenes oficiales DGT (agrupaciones de preguntas en el orden real publicado)
-- tema_id NULL       -> simulacro oficial mixto (todos los temas)
-- tema_id NOT NULL   -> bloque de test de un tema concreto (Tema X - Test N)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS examenes_oficiales (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre          TEXT NOT NULL,
    carnet          TEXT NOT NULL DEFAULT 'B',
    fecha           TEXT,
    descripcion     TEXT,
    tema_id         INTEGER REFERENCES temas(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_examenes_tema ON examenes_oficiales(tema_id, carnet);

CREATE TABLE IF NOT EXISTS examen_preguntas (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    examen_id       INTEGER NOT NULL REFERENCES examenes_oficiales(id) ON DELETE CASCADE,
    pregunta_id     INTEGER NOT NULL REFERENCES preguntas(id) ON DELETE CASCADE,
    orden           INTEGER NOT NULL,
    UNIQUE(examen_id, orden)
);

CREATE INDEX IF NOT EXISTS idx_examen_preguntas_examen ON examen_preguntas(examen_id);

-- ---------------------------------------------------------------------------
-- Tests realizados (intentos) por un usuario
-- tipo: 'aleatorio' | 'tema' | 'oficial' | 'repaso'
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tests (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id          INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    tipo                TEXT NOT NULL CHECK (tipo IN ('aleatorio','tema','oficial','repaso')),
    tema_id             INTEGER REFERENCES temas(id) ON DELETE SET NULL,
    examen_id           INTEGER REFERENCES examenes_oficiales(id) ON DELETE SET NULL,
    carnet              TEXT NOT NULL DEFAULT 'B',
    num_preguntas       INTEGER NOT NULL DEFAULT 0,
    aciertos            INTEGER NOT NULL DEFAULT 0,
    fallos              INTEGER NOT NULL DEFAULT 0,
    en_blanco           INTEGER NOT NULL DEFAULT 0,
    tiempo_segundos     INTEGER,
    aprobado            INTEGER,
    iniciado_en         TEXT NOT NULL DEFAULT (datetime('now')),
    finalizado_en       TEXT
);

CREATE INDEX IF NOT EXISTS idx_tests_usuario ON tests(usuario_id);

-- ---------------------------------------------------------------------------
-- Preguntas concretas que componen cada test, en el orden mostrado,
-- junto con la respuesta elegida por el usuario (se rellena al responder).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS test_preguntas (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    test_id             INTEGER NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
    pregunta_id         INTEGER NOT NULL REFERENCES preguntas(id) ON DELETE CASCADE,
    orden               INTEGER NOT NULL,
    opcion_elegida_id   INTEGER REFERENCES opciones(id) ON DELETE SET NULL,
    es_correcta         INTEGER,
    respondida_en       TEXT,
    UNIQUE(test_id, orden)
);

CREATE INDEX IF NOT EXISTS idx_test_preguntas_test ON test_preguntas(test_id);
CREATE INDEX IF NOT EXISTS idx_test_preguntas_pregunta ON test_preguntas(pregunta_id);

-- ---------------------------------------------------------------------------
-- Notas del "Cuaderno" de estudio. Pueden ir sueltas o vinculadas a una
-- pregunta, un tema y/o un bloque/simulacro (examenes_oficiales), y venir
-- escritas a mano o guardadas desde una conversación con el asistente IA.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notas (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id      INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    pregunta_id     INTEGER REFERENCES preguntas(id) ON DELETE SET NULL,
    tema_id         INTEGER REFERENCES temas(id) ON DELETE SET NULL,
    examen_id       INTEGER REFERENCES examenes_oficiales(id) ON DELETE SET NULL,
    titulo          TEXT NOT NULL DEFAULT '',
    contenido       TEXT NOT NULL,
    origen          TEXT NOT NULL DEFAULT 'manual' CHECK (origen IN ('manual', 'ia', 'mixta')),
    categoria       TEXT,
    etiquetas       TEXT,
    creado_en       TEXT NOT NULL DEFAULT (datetime('now')),
    actualizado_en  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_notas_usuario ON notas(usuario_id);
CREATE INDEX IF NOT EXISTS idx_notas_pregunta ON notas(pregunta_id);
CREATE INDEX IF NOT EXISTS idx_notas_tema ON notas(tema_id);
