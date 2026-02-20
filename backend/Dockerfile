FROM alpine:edge AS builder

# Install zig
RUN apk add --no-cache zig

WORKDIR /app

# Copy the build file, dependencies, and seed data
COPY build.zig build.zig.zon ./
COPY deps deps/
COPY data data/

# First build step just downloads dependencies
# In Zig, fetching dependencies is done by building with --fetch
RUN zig build --fetch || true

# Copy source code
COPY src src/

# Build the release binary
RUN zig build -Doptimize=ReleaseSafe

# -- Production Image --
FROM alpine:latest

# Install necessary runtime dependencies (SQLite might need standard C lib, although we statically link mostly, it's safer)
RUN apk add --no-cache ca-certificates tzdata

WORKDIR /app

# Copy the compiled binary from the builder stage
COPY --from=builder /app/zig-out/bin/backend /app/backend
# Copy the seed data which is needed to initialize the database
COPY --from=builder /app/data/seeds /app/data/seeds

# Expose the default port (Render will override this via the PORT environment variable)
EXPOSE 3000

# Run the backend
ENTRYPOINT ["/app/backend"]
