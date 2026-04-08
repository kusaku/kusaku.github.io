---
title: "postgres vs clickhouse for bulk dataframe io: csv, records, native, parquet"
description: "i benchmarked bulk read/write paths from pandas and polars into postgres and clickhouse, and the transport format mattered more than i expected."
date: 2026-04-07 12:40:00 +0200
lang: "en"
tags:
  - "code"
  - "postgres"
  - "clickhouse"
  - "pandas"
  - "polars"
  - "parquet"
  - "benchmark"
---

I keep asking myself the same question: if I already have a `pandas` or `polars` dataframe, what is the fastest realistic way to push a big chunk of analytical data into Postgres or ClickHouse, and what is the fastest way to read it back?

On paper, the answer looks obvious. Postgres has `COPY`. ClickHouse has a native protocol and likes columnar formats. Both databases have Python libraries. `pandas` and `polars` even have built-in database helpers.

In practice, it is messier than that.

The dataframe already has typed data. Turning it into CSV is convenient, but it is still serialization to text and parsing back from text again. That pipe is not free. The same problem exists on reads: query result -> cursor rows or CSV -> dataframe is not the most elegant route if you care about throughput.

So I built a separate benchmark project and compared a bunch of techniques:

- Postgres `COPY FROM STDIN` from dataframe-generated delimited text
- Postgres `COPY FROM STDIN (FORMAT binary)`
- Postgres `COPY TO STDOUT`
- Postgres `pg_parquet`
- ClickHouse `INSERT FORMAT CSV/TSV`
- ClickHouse native columnar inserts and reads
- ClickHouse `FORMAT Parquet` for both write and read
- sync and async driver variants
- `pandas` and `polars`

I used a generic analytical table shape:

- one UUID key: `entity_key`
- one date: `event_date`
- one source id: `source_id`
- six text dimensions: `dimension_a` ... `dimension_f`
- three integer metrics: `metric_1` ... `metric_3`
- one floating metric: `metric_value`

So this is not a toy integers-only dataset, but also not anything domain-specific.

The benchmark table definitions looked roughly like this.

Postgres:

```sql
CREATE TABLE analytics_metrics (
    entity_key uuid NOT NULL,
    event_date date NOT NULL,
    source_id integer NOT NULL,
    dimension_a text NOT NULL DEFAULT '',
    dimension_b text NOT NULL DEFAULT '',
    dimension_c text NOT NULL DEFAULT '',
    -- dimension_d, dimension_e, dimension_f
    metric_1 integer NOT NULL,
    metric_2 integer NOT NULL,
    metric_3 integer NOT NULL,
    metric_value double precision NOT NULL,
    PRIMARY KEY (
        entity_key,
        event_date,
        source_id,
        dimension_a,
        dimension_b,
        dimension_c
        -- plus dimension_d, dimension_e, dimension_f
    )
);
```

ClickHouse:

```sql
CREATE TABLE analytics_metrics (
    entity_key UUID,
    event_date Date,
    source_id Int32,
    dimension_a LowCardinality(String) DEFAULT '',
    dimension_b String DEFAULT '',
    dimension_c String DEFAULT '',
    -- dimension_d, dimension_e, dimension_f
    metric_1 Int32,
    metric_2 Int32,
    metric_3 Int32,
    metric_value Float64
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(event_date)
ORDER BY (
    entity_key,
    event_date,
    source_id,
    dimension_a,
    dimension_b,
    dimension_c
    -- plus dimension_d, dimension_e, dimension_f
);
```

I trimmed a few repeated fields in the snippets above for readability. The real benchmark schema uses the full six dimensions in both databases.

## Short version

- On Postgres writes, the best path was binary `COPY FROM STDIN` via `asyncpg.copy_records_to_table()`.
- On Postgres reads, the clear winner was `COPY TO STDOUT` into a Polars dataframe.
- On ClickHouse, the biggest story was not the native protocol. It was Parquet over HTTP.
- For this kind of dataframe-heavy analytical workload, transport format mattered more than the simple `sync` / `async` label.

## Results

I stopped trusting single lucky runs pretty early.

The numbers below are based on three full `100_000`-row benchmark passes. I use the mean rows/s as the main number, and I keep min/max rows/s ranges later in the full matrix.

One important clarification before the numbers: when I say `sync` and `async` in this post, I mean the Python client style:

- `sync` means ordinary blocking Python calls
- `async` means `asyncio`-based Python code and async drivers like `asyncpg` or `asynch`

This is not about some magical “async mode” inside Postgres or ClickHouse themselves. It is simply about which Python driver API I used and what data transport it exposed.

Legend:

- `asyncpg`, `psycopg`, `clickhouse-driver`, `asynch` are the Python drivers
- `http`, `native`, `COPY FROM STDIN`, `COPY TO STDOUT`, `row fetch` describe the transport path
- `csv/tsv`, `parquet`, `rows`, `columnar` describe the payload shape
- `pandas` / `polars` describe the dataframe library on the Python side

### Postgres write

The strongest Postgres write result was still binary `COPY FROM STDIN` through `asyncpg.copy_records_to_table()`.

| technique | avg s | rows/s |
| --- | ---: | ---: |
| `asyncpg COPY FROM STDIN (FORMAT binary)` from Polars rows | `0.3969` | `257,641.76` |
| `asyncpg COPY FROM STDIN (FORMAT binary)` from Pandas rows | `0.4671` | `233,233.74` |
| `asyncpg COPY FROM STDIN` from Polars delimited text | `0.5503` | `194,394.10` |
| `psycopg COPY FROM STDIN` from Polars delimited text | `0.6713` | `183,134.46` |
| `psycopg pg_parquet COPY FROM file.parquet` from Pandas dataframe | `0.8991` | `115,820.14` |
| `psycopg COPY FROM STDIN` from Pandas delimited text | `1.0581` | `100,358.01` |
| `psycopg pg_parquet COPY FROM file.parquet` from Polars dataframe | `1.1010` | `92,026.79` |
| `asyncpg COPY FROM STDIN` from Pandas delimited text | `1.1421` | `88,913.32` |

What stands out:

- binary `COPY FROM STDIN` was still the top Postgres write family
- the Polars binary path finished clearly ahead of the Pandas binary path on the repeated-run mean
- delimited-text `COPY` was still strong, especially with Polars
- `pg_parquet` write worked, but it stayed clearly below the best direct `COPY` paths

### Postgres read

The biggest Postgres surprise was still `COPY TO STDOUT`.

| technique | avg s | rows/s |
| --- | ---: | ---: |
| `psycopg COPY TO STDOUT` delimited text -> Polars dataframe | `0.1380` | `729,601.29` |
| `psycopg COPY TO STDOUT` delimited text -> Pandas dataframe | `0.2469` | `409,428.20` |
| `psycopg pg_parquet COPY TO file.parquet` -> Polars dataframe | `0.2824` | `354,604.20` |
| `psycopg pg_parquet COPY TO file.parquet` -> Pandas dataframe | `0.2852` | `350,840.74` |
| `psycopg / SQLAlchemy -> polars.read_database` | `0.3497` | `285,992.11` |
| `asyncpg prepared row fetch` -> Polars dataframe | `0.3509` | `285,090.65` |
| `psycopg / SQLAlchemy -> pandas.read_sql_query` | `0.3618` | `276,977.01` |
| `asyncpg row fetch` -> Pandas dataframe | `0.3714` | `270,368.02` |
| `asyncpg row fetch` -> Polars dataframe | `0.3769` | `265,789.51` |
| `psycopg row fetch` -> Pandas dataframe | `0.4610` | `217,262.11` |
| `asyncpg prepared row fetch` -> Pandas dataframe | `0.4675` | `214,194.20` |
| `psycopg row fetch` -> Polars dataframe | `0.5428` | `184,251.91` |

What stands out:

- `COPY TO STDOUT` plus dataframe parsing was the strongest Postgres read family by a large margin
- `pg_parquet` was still very good on reads, and the Pandas and Polars Parquet paths ended up very close
- convenience helpers like `pandas.read_sql_query` and `polars.read_database` were respectable middle-tier baselines, not disasters

### ClickHouse write

Once Parquet entered the picture, it stopped being “text inserts vs native columnar”. Parquet over HTTP became the strongest write family.

| technique | avg s | rows/s |
| --- | ---: | ---: |
| `httpx async HTTP INSERT FORMAT Parquet` from Polars dataframe | `0.1101` | `913,568.15` |
| `urllib HTTP INSERT FORMAT Parquet` from Polars dataframe | `0.1188` | `850,917.02` |
| `httpx async HTTP INSERT FORMAT Parquet` from Pandas dataframe | `0.1379` | `725,562.69` |
| `urllib HTTP INSERT FORMAT Parquet` from Pandas dataframe | `0.1466` | `683,049.08` |
| `clickhouse-driver INSERT FORMAT TSV` from Polars delimited text | `0.2343` | `434,055.87` |
| `SQLAlchemy over native driver INSERT FORMAT TSV` from Polars delimited text | `0.2314` | `432,907.49` |
| `clickhouse-driver INSERT FORMAT CSV` from Polars delimited text | `0.2344` | `429,806.01` |
| `SQLAlchemy over native driver INSERT FORMAT CSV` from Polars delimited text | `0.2505` | `403,879.61` |
| `asynch INSERT FORMAT TSV` from Polars delimited text | `0.2491` | `401,484.88` |
| `asynch INSERT FORMAT CSV` from Polars delimited text | `0.2548` | `392,563.48` |

What stands out:

- Parquet over HTTP was clearly the strongest ClickHouse write family
- Polars beat Pandas on the strongest ClickHouse write paths
- the stronger text-insert Polars paths formed one broad tier around `390k` to `434k rows/s`
- native columnar was respectable, but not the overall winner

### ClickHouse read

The strongest ClickHouse read paths were all HTTP format reads, especially into Polars.

| technique | avg s | rows/s |
| --- | ---: | ---: |
| `httpx async HTTP SELECT ... FORMAT Parquet` -> Polars dataframe | `0.0566` | `1,768,641.67` |
| `httpx async HTTP SELECT ... FORMAT Parquet` -> Pandas dataframe | `0.0684` | `1,461,861.92` |
| `urllib HTTP SELECT ... FORMAT Parquet` -> Polars dataframe | `0.0691` | `1,448,298.12` |
| `httpx async HTTP SELECT ... FORMAT CSV` -> Polars dataframe | `0.0705` | `1,427,919.65` |
| `urllib HTTP SELECT ... FORMAT CSV` -> Polars dataframe | `0.0835` | `1,283,592.69` |
| `urllib HTTP SELECT ... FORMAT Parquet` -> Pandas dataframe | `0.0800` | `1,260,266.31` |
| `clickhouse-driver native columnar fetch` -> Polars dataframe | `0.2479` | `403,499.61` |
| `clickhouse-driver native columnar fetch` -> Pandas dataframe | `0.4019` | `248,858.91` |
| `SQLAlchemy over native driver row fetch` -> Polars dataframe | `0.4942` | `202,359.81` |
| `asynch native columnar fetch` -> Polars dataframe | `0.5424` | `184,390.05` |

What stands out:

- the top ClickHouse read tier was all HTTP CSV/Parquet into Polars
- HTTP Parquet into Pandas was also much stronger than the row-fetch and async-native paths
- direct native columnar fetch into Polars was decent, but nowhere near the HTTP CSV/Parquet winners

### Cross-database takeaway

If I collapse the whole experiment to just the winners:

| database | direction | best technique | rows/s |
| --- | --- | --- | ---: |
| Postgres | write | `asyncpg COPY FROM STDIN (FORMAT binary)` from Polars rows | `257,641.76` |
| Postgres | read | `psycopg COPY TO STDOUT` delimited text -> Polars dataframe | `729,601.29` |
| ClickHouse | write | `httpx async HTTP INSERT FORMAT Parquet` from Polars dataframe | `913,568.15` |
| ClickHouse | read | `httpx async HTTP SELECT ... FORMAT Parquet` -> Polars dataframe | `1,768,641.67` |

So in this benchmark:

- the best ClickHouse write path was about `3.55x` faster than the best Postgres write path
- the best ClickHouse read path was about `2.42x` faster than the best Postgres read path

The big lesson for me is still that the transport format mattered more than the `sync` / `async` label by itself.

## How the Families Work

You do not need this section to get the headline results. This is the part I wish I had before I started: a plain explanation of what each family actually does.

### Postgres `COPY FROM STDIN` from delimited text

This is the classic bulk-ingest path. The dataframe becomes delimited text, then PostgreSQL parses it during `COPY`.

With `asyncpg`:

```python
import io

buffer = io.BytesIO()
polars_df.write_csv(
    buffer,
    include_header=False,
    separator="\t",
    null_value=r"\N",
)
buffer.seek(0)

await pg_asyncpg_conn.copy_to_table(
    "analytics_metrics",
    source=buffer,
    columns=[
        "entity_key",
        "event_date",
        "source_id",
        "dimension_a",
        "dimension_b",
        "dimension_c",
        "dimension_d",
        "dimension_e",
        "dimension_f",
        "metric_1",
        "metric_2",
        "metric_3",
        "metric_value",
    ],
    format="csv",
    header=False,
    delimiter="\t",
    null=r"\N",
)
```

With sync `psycopg`:

```python
import io

buffer = io.BytesIO()
pandas_df.to_csv(
    buffer,
    index=False,
    header=False,
    sep="\t",
    na_rep=r"\N",
)

copy_sql = """
COPY analytics_metrics (
    entity_key,
    event_date,
    source_id,
    dimension_a,
    dimension_b,
    dimension_c,
    dimension_d,
    dimension_e,
    dimension_f,
    metric_1,
    metric_2,
    metric_3,
    metric_value
)
FROM STDIN
WITH (FORMAT csv, DELIMITER E'\\t', NULL '\\N')
"""

with pg_psycopg_conn.cursor().copy(copy_sql) as copy:
    copy.write(buffer.getbuffer())
```

This family stayed strong, especially with Polars, but it was no longer the top Postgres write tier once binary `COPY` entered the comparison.

### Postgres `COPY FROM STDIN (FORMAT binary)`

This is still `COPY FROM STDIN`, but in binary mode. In `asyncpg`, that path is exposed as `copy_records_to_table()`.

Representative example:

```python
import uuid

await pg_asyncpg_conn.copy_records_to_table(
    "analytics_metrics",
    records=(
        (
            uuid.UUID(row[0]),
            row[1],
            row[2],
            row[3],
            row[4],
            row[5],
            row[6],
            row[7],
            row[8],
            row[9],
            row[10],
            row[11],
            row[12],
        )
        for row in pandas_df.itertuples(index=False, name=None)
    ),
    columns=list(pandas_df.columns),
)
```

The key difference is simple:

- text `COPY`: serialize values into delimited text first
- binary `COPY`: send typed row tuples and let the driver encode PostgreSQL binary `COPY`

This was the strongest Postgres write family in the benchmark.

### Postgres row fetch and prepared row fetch

Plain row fetch is the ordinary query path:

```python
rows = await pg_asyncpg_conn.fetch("""
    SELECT entity_key, event_date, source_id, dimension_a, dimension_b, dimension_c,
           dimension_d, dimension_e, dimension_f, metric_1, metric_2, metric_3,
           metric_value
    FROM analytics_metrics
""")

df = pl.DataFrame(
    [tuple(row) for row in rows],
    schema=[
        "entity_key",
        "event_date",
        "source_id",
        "dimension_a",
        "dimension_b",
        "dimension_c",
        "dimension_d",
        "dimension_e",
        "dimension_f",
        "metric_1",
        "metric_2",
        "metric_3",
        "metric_value",
    ],
    orient="row",
)
```

Prepared row fetch means the driver prepares the SQL first, then fetches rows through that prepared statement:

```python
statement = await pg_asyncpg_conn.prepare("""
    SELECT entity_key, event_date, source_id, dimension_a, dimension_b, dimension_c,
           dimension_d, dimension_e, dimension_f, metric_1, metric_2, metric_3,
           metric_value
    FROM analytics_metrics
""")

rows = await statement.fetch()
```

Both are still row-based reads. The difference is just the driver path before the dataframe gets built.

### Postgres convenience dataframe readers

I also kept the common convenience readers in the benchmark, because they are the obvious default many people reach for first.

`pandas.read_sql_query`:

```python
import pandas as pd

df = pd.read_sql_query(
    """
    SELECT entity_key, event_date, source_id, dimension_a, dimension_b, dimension_c,
           dimension_d, dimension_e, dimension_f, metric_1, metric_2, metric_3,
           metric_value
    FROM analytics_metrics
    """,
    pg_sync_engine,
)
```

`polars.read_database`:

```python
import polars as pl

df = pl.read_database(
    """
    SELECT entity_key, event_date, source_id, dimension_a, dimension_b, dimension_c,
           dimension_d, dimension_e, dimension_f, metric_1, metric_2, metric_3,
           metric_value
    FROM analytics_metrics
    """,
    connection=pg_sync_engine,
)
```

These were not the top Postgres read paths, but they were still decent middle-tier baselines.

### Postgres `COPY TO STDOUT`

This was the surprise winner on Postgres reads.

```python
import io
import polars as pl

buffer = io.BytesIO()

copy_sql = """
COPY (
    SELECT entity_key, event_date, source_id, dimension_a, dimension_b, dimension_c,
           dimension_d, dimension_e, dimension_f, metric_1, metric_2, metric_3,
           metric_value
    FROM analytics_metrics
)
TO STDOUT
WITH (FORMAT csv, DELIMITER E'\\t', NULL '\\N')
"""

with pg_psycopg_conn.cursor().copy(copy_sql) as copy:
    while chunk := copy.read():
        if isinstance(chunk, memoryview):
            buffer.write(chunk.tobytes())
        elif isinstance(chunk, bytes):
            buffer.write(chunk)
        else:
            buffer.write(chunk.encode("utf-8"))

df = pl.read_csv(
    io.BytesIO(buffer.getvalue()),
    separator="\t",
    has_header=False,
    new_columns=[
        "entity_key",
        "event_date",
        "source_id",
        "dimension_a",
        "dimension_b",
        "dimension_c",
        "dimension_d",
        "dimension_e",
        "dimension_f",
        "metric_1",
        "metric_2",
        "metric_3",
        "metric_value",
    ],
    null_values=r"\N",
)
```

The result was much stronger than ordinary row fetch and even clearly stronger than `pg_parquet` on Postgres reads.

### Postgres `pg_parquet`

Postgres does not support Parquet in core, so I used the [`pg_parquet`](https://github.com/CrunchyData/pg_parquet) extension.

In this benchmark, the write path was file-based:

```python
from pathlib import Path
from sqlalchemy import text

host_path = Path(".local/pg_parquet/input.parquet")
polars_df.write_parquet(host_path)

with pg_sync_engine.begin() as conn:
    conn.execute(text("""
        COPY analytics_metrics (
            entity_key,
            event_date,
            source_id,
            dimension_a,
            dimension_b,
            dimension_c,
            dimension_d,
            dimension_e,
            dimension_f,
            metric_1,
            metric_2,
            metric_3,
            metric_value
        )
        FROM '/benchmark-io/input.parquet'
        WITH (FORMAT parquet)
    """))
```

For reads:

```python
from pathlib import Path
import polars as pl
from sqlalchemy import text

host_path = Path(".local/pg_parquet/output.parquet")

with pg_sync_engine.begin() as conn:
    conn.execute(text("""
        COPY (
            SELECT entity_key, event_date, source_id, dimension_a, dimension_b, dimension_c,
                   dimension_d, dimension_e, dimension_f, metric_1, metric_2, metric_3,
                   metric_value
            FROM analytics_metrics
        )
        TO '/benchmark-io/output.parquet'
        WITH (FORMAT parquet)
    """))

df = pl.read_parquet(host_path)
```

`pg_parquet` reads were good. `pg_parquet` writes were functional but clearly slower than the best direct `COPY FROM STDIN` paths.

I do not think that means Parquet is universally bad for Postgres writes. In this setup, the `pg_parquet` path includes extra work outside the server:

- build a Parquet file in Python
- write it to a mounted directory
- let Postgres read it back from that mounted path

That is a very different transport path from streaming `COPY FROM STDIN` directly from process memory.

### PostgreSQL + `pg_parquet` locally

For local benchmarking I used a custom PostgreSQL 18 Docker image with `pg_parquet` installed, then mounted a shared directory for the Parquet files:

```bash
docker run -d \
  --name storage-io-benchmark-postgres \
  -e POSTGRES_USER=benchmark \
  -e POSTGRES_PASSWORD=benchmark \
  -e POSTGRES_DB=benchmark \
  -v "$PWD/.local/pg_parquet:/benchmark-io" \
  -p 55432:5432 \
  storage-io-benchmark-postgres:pg-parquet \
  postgres -c shared_preload_libraries=pg_parquet
```

That is enough to make the file-based `pg_parquet` examples above work locally.

## ClickHouse families

### ClickHouse text inserts through a SQLAlchemy engine

Here SQLAlchemy is just the execution wrapper. It is not ORM, and the actual ClickHouse transport underneath is still the native driver stack.

```python
payload = polars_df.write_csv(file=None, include_header=False, separator="\t")

with ch_sync_engine.connect() as conn:
    conn.exec_driver_sql(
        "INSERT INTO analytics_metrics "
        "(entity_key, event_date, source_id, dimension_a, dimension_b, dimension_c, "
        "dimension_d, dimension_e, dimension_f, metric_1, metric_2, metric_3, metric_value) "
        f"FORMAT TabSeparated\n{payload}"
    )
```

### ClickHouse text inserts through direct `clickhouse-driver`

This is the same SQL idea, but without the SQLAlchemy wrapper:

```python
payload = polars_df.write_csv(file=None, include_header=False, separator="\t")

ch_native_client.execute(
    "INSERT INTO analytics_metrics "
    "(entity_key, event_date, source_id, dimension_a, dimension_b, dimension_c, "
    "dimension_d, dimension_e, dimension_f, metric_1, metric_2, metric_3, metric_value) "
    f"FORMAT TabSeparated\n{payload}"
)
```

These direct and wrapped text-insert Polars paths all landed in the same broad performance tier, with the direct `clickhouse-driver` TSV path usually at the top of that tier.

### ClickHouse text inserts through async `asynch`

The async native-driver variant looks similar:

```python
payload = polars_df.write_csv(file=None, include_header=False, separator="\t")

async with ch_async_engine.connect() as conn:
    await conn.exec_driver_sql(
        "INSERT INTO analytics_metrics "
        "(entity_key, event_date, source_id, dimension_a, dimension_b, dimension_c, "
        "dimension_d, dimension_e, dimension_f, metric_1, metric_2, metric_3, metric_value) "
        f"FORMAT TabSeparated\n{payload}"
    )
```

In this benchmark, the async ClickHouse text paths were consistently slower than the best sync text paths.

### ClickHouse native columnar insert

ClickHouse also lets you send column-oriented payloads over the native protocol:

```python
columns = list(polars_df.columns)
payload = [polars_df.get_column(column).to_list() for column in columns]

ch_native_client.execute(
    "INSERT INTO analytics_metrics "
    "(entity_key, event_date, source_id, dimension_a, dimension_b, dimension_c, "
    "dimension_d, dimension_e, dimension_f, metric_1, metric_2, metric_3, metric_value) "
    "VALUES",
    params=payload,
    columnar=True,
)
```

This was decent, but it still trailed the strongest HTTP Parquet write paths.

### ClickHouse Parquet over HTTP

This is the path that changed the whole ClickHouse picture.

Write:

```python
import base64
import io
from urllib.parse import quote
from urllib.request import Request, urlopen

buffer = io.BytesIO()
polars_df.write_parquet(buffer)

query = (
    "INSERT INTO analytics_metrics "
    "(entity_key, event_date, source_id, dimension_a, dimension_b, dimension_c, "
    "dimension_d, dimension_e, dimension_f, metric_1, metric_2, metric_3, metric_value) "
    "FORMAT Parquet"
)

request = Request(
    f"http://localhost:58123/?database=default&query={quote(query)}",
    data=buffer.getvalue(),
    method="POST",
    headers={
        "Authorization": "Basic " + base64.b64encode(b"benchmark:benchmark").decode("ascii"),
        "Content-Type": "application/octet-stream",
    },
)

with urlopen(request, timeout=60) as response:
    response.read()
```

Read:

```python
import base64
import io
import polars as pl
from urllib.parse import quote
from urllib.request import Request, urlopen

query = """
SELECT entity_key, event_date, source_id, dimension_a, dimension_b, dimension_c,
       dimension_d, dimension_e, dimension_f, metric_1, metric_2, metric_3,
       metric_value
FROM analytics_metrics
FORMAT Parquet
"""

request = Request(
    f"http://localhost:58123/?database=default&query={quote(query)}",
    method="POST",
    headers={"Authorization": "Basic " + base64.b64encode(b"benchmark:benchmark").decode("ascii")},
)

with urlopen(request, timeout=60) as response:
    parquet_bytes = response.read()

df = pl.read_parquet(io.BytesIO(parquet_bytes))
```

One important detail: in this benchmark, Parquet is an HTTP path, not a native binary-driver path. So when Parquet wins on ClickHouse here, it means “Parquet over HTTP”.

I used both a plain blocking `urllib` client and an async `httpx` client in the benchmark. The `urllib` version is the smallest possible example, but the `httpx` path is just as straightforward:

```python
import httpx
import io

buffer = io.BytesIO()
polars_df.write_parquet(buffer)

query = (
    "INSERT INTO analytics_metrics "
    "(entity_key, event_date, source_id, dimension_a, dimension_b, dimension_c, "
    "dimension_d, dimension_e, dimension_f, metric_1, metric_2, metric_3, metric_value) "
    "FORMAT Parquet"
)

async with httpx.AsyncClient(
    base_url="http://localhost:58123",
    auth=("benchmark", "benchmark"),
    timeout=60.0,
) as client:
    await client.post(
        "/",
        params={"database": "default", "query": query},
        content=buffer.getvalue(),
        headers={"Content-Type": "application/octet-stream"},
    )
```

Across the repeated runs, the two HTTP clients stayed in the same top ClickHouse Parquet tier, with `httpx` slightly ahead on writes by mean throughput.

### ClickHouse CSV over HTTP

CSV is still worth keeping as a baseline because it is so easy to reason about:

```python
import io
import polars as pl
from urllib.parse import quote
from urllib.request import Request, urlopen

query = """
SELECT entity_key, event_date, source_id, dimension_a, dimension_b, dimension_c,
       dimension_d, dimension_e, dimension_f, metric_1, metric_2, metric_3,
       metric_value
FROM analytics_metrics
FORMAT CSV
"""

request = Request(
    f"http://localhost:58123/?database=default&query={quote(query)}",
    method="POST",
)

with urlopen(request, timeout=60) as response:
    payload = response.read()

df = pl.read_csv(
    io.BytesIO(payload),
    has_header=False,
    new_columns=[
        "entity_key",
        "event_date",
        "source_id",
        "dimension_a",
        "dimension_b",
        "dimension_c",
        "dimension_d",
        "dimension_e",
        "dimension_f",
        "metric_1",
        "metric_2",
        "metric_3",
        "metric_value",
    ],
)
```

On ClickHouse reads, HTTP CSV into Polars was actually in the same top performance tier as HTTP Parquet into Polars.

### ClickHouse row fetch and native columnar fetch

For completeness, I also benchmarked the more ordinary query-result paths.

Direct native columnar fetch:

```python
data, columns_with_types = ch_native_client.execute(
    """
    SELECT entity_key, event_date, source_id, dimension_a, dimension_b, dimension_c,
           dimension_d, dimension_e, dimension_f, metric_1, metric_2, metric_3,
           metric_value
    FROM analytics_metrics
    """,
    with_column_types=True,
    columnar=True,
)

df = pl.DataFrame({name: values for (name, _), values in zip(columns_with_types, data, strict=True)})
```

Wrapped row fetch:

```python
import polars as pl
from sqlalchemy import text

with ch_sync_engine.connect() as conn:
    result = conn.execute(text("""
        SELECT entity_key, event_date, source_id, dimension_a, dimension_b, dimension_c,
               dimension_d, dimension_e, dimension_f, metric_1, metric_2, metric_3,
               metric_value
        FROM analytics_metrics
    """))
    rows = result.all()

df = pl.DataFrame(rows, schema=result.keys(), orient="row")
```

These worked, but both were well below the top HTTP CSV/Parquet read tier.

## Convenience helpers

I still kept the more convenient high-level helpers in the benchmark, but they were not the winner paths.

That is not surprising. Those APIs are optimized for convenience and compatibility, not for pushing a large analytical batch as fast as possible. On reads, some of them were respectable middle-tier baselines. On writes, the throughput-oriented primitives were clearly better.

## The practical ranking I ended up with

### Postgres write

1. `asyncpg COPY FROM STDIN (FORMAT binary)`
2. `asyncpg COPY FROM STDIN` from Polars delimited text
3. `psycopg COPY FROM STDIN` from Polars delimited text
4. `pg_parquet`

### Postgres read

1. `psycopg COPY TO STDOUT` -> Polars
2. `psycopg COPY TO STDOUT` -> Pandas
3. `pg_parquet` -> Polars
4. `pg_parquet` -> Pandas
5. prepared row fetch / convenience read helpers

### ClickHouse write

1. Parquet over HTTP from Polars
2. Parquet over HTTP from Pandas
3. text `INSERT FORMAT CSV/TSV` from Polars through `clickhouse-driver`, SQLAlchemy over native driver, or `asynch`
4. native columnar

### ClickHouse read

1. HTTP Parquet -> Polars
2. HTTP CSV -> Polars and HTTP Parquet -> Pandas
3. native columnar -> Polars
4. row fetch and async native-driver paths

## Takeaway

I started this experiment with a simple intuition: delimited text is probably still the most practical bulk format, and native protocol should beat everything else when available.

That intuition was only half right.

On Postgres, `COPY` is still the core story, but the strongest Postgres write result was not the delimited-text path. It was binary `COPY FROM STDIN`.

On ClickHouse, the really big story was not the native protocol at all. It was format transport. Parquet over HTTP became the strongest write path and the strongest read path too. HTTP CSV into Polars also turned out to be much faster than I expected.

So if the data already lives in a typed dataframe, it is worth questioning the old “serialize to CSV and hope for the best” default. Sometimes the fastest path is the one that preserves more structure instead of flattening everything into text first.

## Full benchmark matrix

These are the mean results over three full `100_000`-row benchmark runs. I include the min and max rows/s across those runs to show where the results were stable and where they moved around more.

### Postgres write

| short description | avg s | rows/s | min rows/s | max rows/s |
| --- | ---: | ---: | ---: | ---: |
| asyncpg `COPY FROM STDIN (FORMAT binary)` from Polars rows | `0.3969` | `257,641.76` | `206,334.89` | `284,167.53` |
| asyncpg `COPY FROM STDIN (FORMAT binary)` from Pandas rows | `0.4671` | `233,233.74` | `149,810.22` | `300,463.87` |
| asyncpg `COPY FROM STDIN` from Polars delimited text | `0.5503` | `194,394.10` | `130,295.31` | `228,938.60` |
| psycopg `COPY FROM STDIN` from Polars delimited text | `0.6713` | `183,134.46` | `87,170.44` | `240,471.32` |
| psycopg `pg_parquet COPY FROM file.parquet` from Pandas dataframe | `0.8991` | `115,820.14` | `85,722.85` | `136,028.67` |
| psycopg `COPY FROM STDIN` from Pandas delimited text | `1.0581` | `100,358.01` | `69,180.30` | `121,430.53` |
| psycopg `pg_parquet COPY FROM file.parquet` from Polars dataframe | `1.1010` | `92,026.79` | `78,810.99` | `104,209.02` |
| asyncpg `COPY FROM STDIN` from Pandas delimited text | `1.1421` | `88,913.32` | `80,137.74` | `105,095.26` |

### Postgres read

| short description | avg s | rows/s | min rows/s | max rows/s |
| --- | ---: | ---: | ---: | ---: |
| psycopg `COPY TO STDOUT` delimited text -> Polars dataframe | `0.1380` | `729,601.29` | `681,514.66` | `817,921.20` |
| psycopg `COPY TO STDOUT` delimited text -> Pandas dataframe | `0.2469` | `409,428.20` | `351,439.77` | `440,500.79` |
| psycopg `pg_parquet COPY TO file.parquet` -> Polars dataframe | `0.2824` | `354,604.20` | `344,472.59` | `374,452.05` |
| psycopg `pg_parquet COPY TO file.parquet` -> Pandas dataframe | `0.2852` | `350,840.74` | `339,514.32` | `356,604.04` |
| psycopg / SQLAlchemy -> `polars.read_database` | `0.3497` | `285,992.11` | `283,482.26` | `289,171.97` |
| asyncpg prepared row fetch -> Polars dataframe | `0.3509` | `285,090.65` | `279,537.82` | `290,644.07` |
| psycopg / SQLAlchemy -> `pandas.read_sql_query` | `0.3618` | `276,977.01` | `262,911.86` | `293,875.30` |
| asyncpg row fetch -> Pandas dataframe | `0.3714` | `270,368.02` | `246,741.41` | `284,086.51` |
| asyncpg row fetch -> Polars dataframe | `0.3769` | `265,789.51` | `255,156.24` | `281,297.68` |
| psycopg row fetch -> Pandas dataframe | `0.4610` | `217,262.11` | `205,284.16` | `224,642.91` |
| asyncpg prepared row fetch -> Pandas dataframe | `0.4675` | `214,194.20` | `206,737.86` | `224,692.22` |
| psycopg row fetch -> Polars dataframe | `0.5428` | `184,251.91` | `181,802.01` | `186,682.20` |

### ClickHouse write

| short description | avg s | rows/s | min rows/s | max rows/s |
| --- | ---: | ---: | ---: | ---: |
| httpx async HTTP `INSERT FORMAT Parquet` from Polars dataframe | `0.1101` | `913,568.15` | `822,671.08` | `962,850.68` |
| urllib HTTP `INSERT FORMAT Parquet` from Polars dataframe | `0.1188` | `850,917.02` | `727,726.12` | `913,700.60` |
| httpx async HTTP `INSERT FORMAT Parquet` from Pandas dataframe | `0.1379` | `725,562.69` | `710,366.43` | `739,926.59` |
| urllib HTTP `INSERT FORMAT Parquet` from Pandas dataframe | `0.1466` | `683,049.08` | `653,143.10` | `707,906.55` |
| clickhouse-driver `INSERT FORMAT TSV` from Polars delimited text | `0.2343` | `434,055.87` | `363,299.05` | `498,094.51` |
| SQLAlchemy over native driver `INSERT FORMAT TSV` from Polars delimited text | `0.2314` | `432,907.49` | `409,117.22` | `447,425.62` |
| clickhouse-driver `INSERT FORMAT CSV` from Polars delimited text | `0.2344` | `429,806.01` | `378,882.10` | `460,384.17` |
| SQLAlchemy over native driver `INSERT FORMAT CSV` from Polars delimited text | `0.2505` | `403,879.61` | `345,271.51` | `437,724.43` |
| asynch `INSERT FORMAT TSV` from Polars delimited text | `0.2491` | `401,484.88` | `395,005.57` | `406,908.24` |
| asynch `INSERT FORMAT CSV` from Polars delimited text | `0.2548` | `392,563.48` | `385,956.34` | `398,376.68` |
| clickhouse-driver native columnar insert from Pandas dataframe | `0.2926` | `342,026.42` | `328,032.38` | `352,178.83` |
| clickhouse-driver native columnar insert from Polars dataframe | `0.3278` | `305,134.11` | `296,079.87` | `311,581.19` |
| asynch native columnar insert from Pandas dataframe | `0.4084` | `244,874.68` | `242,414.33` | `246,184.36` |
| asynch native columnar insert from Polars dataframe | `0.4520` | `221,264.87` | `219,022.73` | `224,027.03` |
| clickhouse-driver `INSERT FORMAT TSV` from Pandas delimited text | `0.5454` | `183,460.70` | `177,008.22` | `188,223.72` |
| clickhouse-driver `INSERT FORMAT CSV` from Pandas delimited text | `0.5459` | `183,184.60` | `182,765.33` | `183,706.19` |
| SQLAlchemy over native driver `INSERT FORMAT TSV` from Pandas delimited text | `0.5546` | `180,694.28` | `169,114.94` | `187,107.86` |
| asynch `INSERT FORMAT TSV` from Pandas delimited text | `0.5667` | `176,546.74` | `172,663.82` | `181,422.89` |
| asynch `INSERT FORMAT CSV` from Pandas delimited text | `0.5768` | `173,389.08` | `172,424.45` | `175,110.24` |
| SQLAlchemy over native driver `INSERT FORMAT CSV` from Pandas delimited text | `0.5803` | `172,433.41` | `168,000.96` | `178,530.73` |

### ClickHouse read

| short description | avg s | rows/s | min rows/s | max rows/s |
| --- | ---: | ---: | ---: | ---: |
| httpx async HTTP `SELECT ... FORMAT Parquet` -> Polars dataframe | `0.0566` | `1,768,641.67` | `1,703,361.08` | `1,808,335.97` |
| httpx async HTTP `SELECT ... FORMAT Parquet` -> Pandas dataframe | `0.0684` | `1,461,861.92` | `1,422,563.35` | `1,493,966.55` |
| urllib HTTP `SELECT ... FORMAT Parquet` -> Polars dataframe | `0.0691` | `1,448,298.12` | `1,402,111.03` | `1,483,388.83` |
| httpx async HTTP `SELECT ... FORMAT CSV` -> Polars dataframe | `0.0705` | `1,427,919.65` | `1,273,501.63` | `1,549,746.21` |
| urllib HTTP `SELECT ... FORMAT CSV` -> Polars dataframe | `0.0835` | `1,283,592.69` | `856,856.01` | `1,511,464.78` |
| urllib HTTP `SELECT ... FORMAT Parquet` -> Pandas dataframe | `0.0800` | `1,260,266.31` | `1,121,492.88` | `1,400,425.93` |
| urllib HTTP `SELECT ... FORMAT CSV` -> Pandas dataframe | `0.1754` | `571,195.13` | `541,055.19` | `595,674.51` |
| httpx async HTTP `SELECT ... FORMAT CSV` -> Pandas dataframe | `0.1762` | `568,584.87` | `537,702.71` | `588,754.64` |
| clickhouse-driver native columnar fetch -> Polars dataframe | `0.2479` | `403,499.61` | `396,713.17` | `415,105.86` |
| clickhouse-driver native columnar fetch -> Pandas dataframe | `0.4019` | `248,858.91` | `246,692.71` | `250,476.55` |
| SQLAlchemy over native driver row fetch -> Pandas dataframe | `0.4651` | `215,021.41` | `213,818.92` | `216,109.31` |
| SQLAlchemy over native driver row fetch -> Polars dataframe | `0.4942` | `202,359.81` | `198,871.39` | `204,113.89` |
| asynch native columnar fetch -> Polars dataframe | `0.5424` | `184,390.05` | `182,285.32` | `185,625.78` |
| asynch native columnar fetch -> Pandas dataframe | `0.7079` | `141,312.12` | `138,845.53` | `144,693.48` |
| asynch row fetch -> Pandas dataframe | `0.7539` | `132,646.58` | `131,645.66` | `133,388.49` |
| asynch row fetch -> Polars dataframe | `0.7924` | `126,205.32` | `125,315.29` | `127,610.80` |
