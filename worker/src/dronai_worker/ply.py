"""Lectura y escritura de nubes de puntos PLY binarias (posición + color)."""

from pathlib import Path

import numpy as np

_PLY_TYPES = {
    "char": "i1", "uchar": "u1", "int8": "i1", "uint8": "u1",
    "short": "i2", "ushort": "u2", "int16": "i2", "uint16": "u2",
    "int": "i4", "uint": "u4", "int32": "i4", "uint32": "u4",
    "float": "f4", "float32": "f4", "double": "f8", "float64": "f8",
}


def read_points(path: Path) -> tuple[np.ndarray, np.ndarray]:
    """Devuelve (posiciones float32 Nx3, colores uint8 Nx3) de un PLY binary_little_endian."""
    data = read_vertices(path)
    xyz = np.stack([data["x"], data["y"], data["z"]], axis=1).astype(np.float32)
    rgb = np.stack([data["red"], data["green"], data["blue"]], axis=1).astype(np.uint8)
    return xyz, rgb


def read_vertices(path: Path) -> np.ndarray:
    """Todos los vértices de un PLY binary_little_endian, como arreglo estructurado de numpy."""
    with open(path, "rb") as f:
        if f.readline().strip() != b"ply":
            raise ValueError(f"{path} no es un archivo PLY")
        count = 0
        fields: list[tuple[str, str]] = []
        in_vertex = False
        while True:
            parts = f.readline().decode("ascii").split()
            if not parts:
                continue
            if parts[0] == "end_header":
                break
            if parts[0] == "format" and parts[1] != "binary_little_endian":
                raise ValueError(f"Formato PLY no soportado: {parts[1]}")
            if parts[0] == "element":
                in_vertex = parts[1] == "vertex"
                if in_vertex:
                    count = int(parts[2])
            elif parts[0] == "property" and in_vertex:
                fields.append((parts[2], "<" + _PLY_TYPES[parts[1]]))
        return np.fromfile(f, dtype=np.dtype(fields), count=count)


def write_points(path: Path, xyz: np.ndarray, rgb: np.ndarray, views: np.ndarray | None = None) -> None:
    """Escribe un PLY binario con x, y, z (float) y red, green, blue (uchar), legible por three.js.

    Si se pasa `views`, agrega la propiedad ushort "view": el índice de la foto que descubre cada punto.
    """
    fields = [("x", "<f4"), ("y", "<f4"), ("z", "<f4"), ("red", "u1"), ("green", "u1"), ("blue", "u1")]
    if views is not None:
        fields.append(("view", "<u2"))
    header = (
        "ply\nformat binary_little_endian 1.0\n"
        f"element vertex {len(xyz)}\n"
        "property float x\nproperty float y\nproperty float z\n"
        "property uchar red\nproperty uchar green\nproperty uchar blue\n"
        + ("property ushort view\n" if views is not None else "")
        + "end_header\n"
    )
    data = np.empty(len(xyz), dtype=fields)
    for i, axis in enumerate("xyz"):
        data[axis] = xyz[:, i]
    for i, channel in enumerate(("red", "green", "blue")):
        data[channel] = rgb[:, i]
    if views is not None:
        data["view"] = views

    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "wb") as f:
        f.write(header.encode("ascii"))
        data.tofile(f)
