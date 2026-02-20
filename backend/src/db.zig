const std = @import("std");
pub const sqlite = @import("sqlite");

// pub const DB_PATH = "./data/db.sqlite"; // Relative path depends on CWD
pub const DB_PATH = "data/db.sqlite";

pub const Word = struct {
    id: i64,
    romaji: []const u8,
    word: []const u8,
    pron: []const u8,
    gram: []const u8,
    level: i32,
    language: []const u8,
};

pub const Result = struct {
    id: i64 = 0,
    wpm: i32,
    accuracy: f32,
    timestamp: i64,
};

pub fn init(allocator: std.mem.Allocator, path: [:0]const u8) !sqlite.Db {
    var db = try sqlite.Db.init(.{
        .mode = sqlite.Db.Mode{ .File = path },
        .open_flags = .{
            .write = true,
            .create = true,
        },
        .threading_mode = .MultiThread,
    });

    // Create words table
    const query =
        \\CREATE TABLE IF NOT EXISTS words (
        \\  id INTEGER PRIMARY KEY, 
        \\  romaji TEXT NOT NULL, 
        \\  word TEXT NOT NULL, 
        \\  pron TEXT NOT NULL, 
        \\  gram TEXT NOT NULL DEFAULT '',
        \\  level INTEGER NOT NULL,
        \\  language TEXT NOT NULL DEFAULT 'jp'
        \\);
        \\CREATE TABLE IF NOT EXISTS results (
        \\  id INTEGER PRIMARY KEY,
        \\  wpm INTEGER,
        \\  accuracy REAL,
        \\  timestamp INTEGER
        \\);
    ;
    try db.execDynamic(query, .{}, .{});
    std.debug.print("Database initialized at {s}\n", .{DB_PATH});

    try seed(&db, allocator);

    return db;
}

fn seed(db: *sqlite.Db, allocator: std.mem.Allocator) !void {
    const count_query = "SELECT count(*) FROM words";
    var stmt = try db.prepareDynamic(count_query);
    defer stmt.deinit();

    const count = try stmt.one(usize, .{}, .{});
    if (count != null and count.? > 0) {
        return;
    }

    std.debug.print("Seeding database from JSON files...\n", .{});

    const insert_query = "INSERT INTO words (romaji, word, pron, gram, level, language) VALUES (?, ?, ?, ?, ?, ?)";

    // Open seeds directory
    var seeds_dir = try std.fs.cwd().openDir("data/seeds", .{ .iterate = true });
    defer seeds_dir.close();

    var walker = seeds_dir.iterate();

    // Define struct for JSON parsing
    const WordJson = struct {
        romaji: []const u8,
        word: []const u8,
        pron: []const u8,
        gram: ?[]const u8 = null,
        level: i32,
    };

    while (try walker.next()) |entry| {
        if (entry.kind != .file) continue;
        if (!std.mem.endsWith(u8, entry.name, ".json")) continue;

        // Entry name format: [lang]-[level].json (e.g., jp-1.json)
        const dot_idx = std.mem.lastIndexOf(u8, entry.name, ".") orelse continue;
        const name_no_ext = entry.name[0..dot_idx];

        var parts = std.mem.splitScalar(u8, name_no_ext, '-');
        const lang_code = parts.next() orelse name_no_ext;
        const level_str = parts.next() orelse "1";
        const level = std.fmt.parseInt(i32, level_str, 10) catch 1;

        std.debug.print("Loading words for language: {s} level: {d}\n", .{ lang_code, level });

        const file = try seeds_dir.openFile(entry.name, .{});
        defer file.close();

        const file_size = (try file.stat()).size;
        const buffer = try allocator.alloc(u8, file_size);
        defer allocator.free(buffer);

        _ = try file.readAll(buffer);

        // Parse JSON
        const parsed = try std.json.parseFromSlice([]WordJson, allocator, buffer, .{ .ignore_unknown_fields = true });
        defer parsed.deinit();

        // Transaction for faster inserts
        try db.execDynamic("BEGIN TRANSACTION", .{}, .{});

        // Multiplier loop to keep the dataset size larger
        for (0..4) |_| {
            for (parsed.value) |word| {
                const gram_val = word.gram orelse "";
                try db.execDynamic(insert_query, .{}, .{ word.romaji, word.word, word.pron, gram_val, word.level, lang_code });
            }
        }

        try db.execDynamic("COMMIT", .{}, .{});
    }

    std.debug.print("Seeding complete.\n", .{});
}

pub fn getRandomWords(db: *sqlite.Db, limit: usize, language: []const u8, level: i32, allocator: std.mem.Allocator) ![]Word {
    const query = "SELECT id, romaji, word, pron, gram, level, language FROM words WHERE language = ? AND level = ? ORDER BY RANDOM() LIMIT ?";
    var stmt = try db.prepareDynamic(query);
    defer stmt.deinit();

    var rows = std.ArrayList(Word).empty;
    errdefer {
        for (rows.items) |item| {
            allocator.free(item.romaji);
            allocator.free(item.word);
            allocator.free(item.pron);
            allocator.free(item.gram);
            allocator.free(item.language);
        }
        rows.deinit(allocator);
    }

    // Iterator args must match query params
    var iter = try stmt.iterator(Word, .{ language, level, limit });

    while (try iter.nextAlloc(allocator, .{})) |row| {
        try rows.append(allocator, row);
    }
    return rows.toOwnedSlice(allocator);
}

pub fn insertResult(db: *sqlite.Db, result: Result) !void {
    const query = "INSERT INTO results (wpm, accuracy, timestamp) VALUES (?, ?, ?)";

    // Using exec instead of preparing for simplicity
    try db.execDynamic(query, .{}, .{
        result.wpm,
        result.accuracy,
        result.timestamp,
    });
}
