const std = @import("std");
const db = @import("db.zig");
pub fn main() !void {
    std.debug.print("Starting backend...\n", .{});

    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    defer _ = gpa.deinit();
    const allocator = gpa.allocator();

    var database = db.init(allocator) catch |err| {
        std.debug.print("Failed to initialize database: {}\n", .{err});
        return err;
    };

    const address = try std.net.Address.parseIp4("127.0.0.1", 3000);
    var listener = try address.listen(.{ .reuse_address = true });
    defer listener.deinit();

    std.debug.print("Listening on http://127.0.0.1:3000\n", .{});

    while (true) {
        const connection = listener.accept() catch |err| {
            std.debug.print("Connection error: {}\n", .{err});
            continue;
        };
        var conn = connection;
        defer conn.stream.close();

        var buffer: [4096]u8 = undefined;
        // std.posix.recv fixes GetLastError(87) on Windows
        const bytes_read = std.posix.recv(conn.stream.handle, &buffer, 0) catch 0;
        if (bytes_read == 0) continue;

        const request = buffer[0..bytes_read];

        // Simple manual parsing
        var first_line_end: usize = 0;
        for (request, 0..) |char, i| {
            if (char == '\r' or char == '\n') {
                first_line_end = i;
                break;
            }
        }
        if (first_line_end == 0) continue;

        const first_line = request[0..first_line_end];

        if (std.mem.startsWith(u8, first_line, "GET /api/words")) {
            // Handle /api/words
            handleGetWords(&database, conn.stream, allocator, first_line) catch |err| {
                std.debug.print("Error handling request: {}\n", .{err});
            };
        } else if (std.mem.startsWith(u8, first_line, "POST /api/results")) {
            // Handle /api/results
            handlePostResults(&database, conn.stream, allocator, request, first_line_end) catch |err| {
                std.debug.print("Error handling POST: {}\n", .{err});
            };
        } else if (std.mem.startsWith(u8, first_line, "OPTIONS")) {
            // Handle CORS preflight
            const response =
                "HTTP/1.1 204 No Content\r\n" ++
                "Access-Control-Allow-Origin: *\r\n" ++
                "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n" ++
                "Access-Control-Allow-Headers: Content-Type\r\n" ++
                "Connection: close\r\n" ++
                "\r\n";
            _ = conn.stream.write(response) catch {};
        } else {
            // 404 Not Found
            const response = "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
            _ = conn.stream.write(response) catch {};
        }
    }
}

fn handleGetWords(database: *db.sqlite.Db, stream: std.net.Stream, allocator: std.mem.Allocator, request_line: []const u8) !void {
    // Parse query params manually
    var language: []const u8 = "jp";
    var level: i32 = 1;

    if (std.mem.indexOf(u8, request_line, "?")) |query_start| {
        const query_all = request_line[query_start + 1 ..];
        // Truncate at space (HTTP version part like " HTTP/1.1")
        const query_string = if (std.mem.indexOfScalar(u8, query_all, ' ')) |space_idx| query_all[0..space_idx] else query_all;

        var it = std.mem.splitScalar(u8, query_string, '&');
        while (it.next()) |param| {
            if (std.mem.startsWith(u8, param, "lang=")) {
                language = param[5..];
            } else if (std.mem.startsWith(u8, param, "level=")) {
                const level_str = param[6..];
                level = std.fmt.parseInt(i32, level_str, 10) catch 1;
            }
        }
    }

    const words = try db.getRandomWords(database, 10, language, level, allocator);
    defer {
        for (words) |word| {
            allocator.free(word.romaji);
            allocator.free(word.word);
            allocator.free(word.pron);
            allocator.free(word.language);
        }
        allocator.free(words);
    }

    var out: std.io.Writer.Allocating = .init(allocator);
    defer out.deinit();
    try std.json.Stringify.value(words, .{}, &out.writer);

    const json_bytes = out.written();

    const header =
        "HTTP/1.1 200 OK\r\n" ++
        "Content-Type: application/json\r\n" ++
        "Access-Control-Allow-Origin: *\r\n" ++
        "Connection: close\r\n";

    const response = try std.fmt.allocPrint(allocator, "{s}Content-Length: {d}\r\n\r\n{s}", .{ header, json_bytes.len, json_bytes });
    defer allocator.free(response);

    _ = stream.write(response) catch {};
}

fn handlePostResults(database: *db.sqlite.Db, stream: std.net.Stream, allocator: std.mem.Allocator, request: []const u8, first_line_end: usize) !void {
    _ = first_line_end; // unused

    // 1. Find the end of headers (\r\n\r\n)
    const header_end = std.mem.indexOf(u8, request, "\r\n\r\n") orelse blk: {
        // Try \n\n just in case
        break :blk (std.mem.indexOf(u8, request, "\n\n") orelse return error.NoBody);
    };

    // 2. Calculate body start
    const body_start = if (request[header_end] == '\r') header_end + 4 else header_end + 2;

    if (body_start >= request.len) {
        return error.NoBody;
    }

    const raw_body = request[body_start..];
    const body = std.mem.trimRight(u8, raw_body, "\x00 \t\r\n");

    if (body.len == 0) {
        return error.EmptyBody;
    }

    // 3. Parse JSON with error handling
    const parsed = std.json.parseFromSlice(db.Result, allocator, body, .{ .ignore_unknown_fields = true }) catch |err| {
        std.debug.print("JSON Parse Error: {}\nBody: {s}\n", .{ err, body });
        const error_response = "HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\nInvalid JSON";
        _ = stream.writeAll(error_response) catch {};
        return;
    };
    defer parsed.deinit();

    // 4. Insert into DB
    try db.insertResult(database, parsed.value);

    // 5. Success Response
    const response =
        "HTTP/1.1 200 OK\r\n" ++
        "Content-Length: 0\r\n" ++
        "Access-Control-Allow-Origin: *\r\n" ++
        "Connection: close\r\n" ++
        "\r\n";

    _ = stream.writeAll(response) catch {};
}
