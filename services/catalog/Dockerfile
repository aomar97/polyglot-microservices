# syntax=docker/dockerfile:1
# ---- build stage ----
FROM golang:1.25-bookworm AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
# Static, stripped binary so we can run on distroless/static.
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/catalog .

# ---- runtime stage ----
# distroless: no shell, no package manager; nonroot user (uid 65532).
FROM gcr.io/distroless/static-debian12:nonroot
WORKDIR /
COPY --from=build /out/catalog /catalog
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/catalog"]
