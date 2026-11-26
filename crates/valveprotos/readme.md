# valveprotos

a subset of protos for steam and valve games. primarily for use in
[haste](https://github.com/blukai/haste), and in other unrelated projects of
mine that happen to share a need to have access to the same set of protos. 

## feature flags

- `deadlock`: enables deadlock protos.
- `gcsdk`: enables game coordinator protos (enabled by `deadlock` and `dota2`).

## scripts

- `graph-imports`: builds a dot graph of imports between protos.
- `fetch-protos`: fetches latest protos from steamdb's
[Protobufs](https://github.com/SteamDatabase/Protobufs) repo.
- `extract-protos`: extracts the protos from the game binaries of a local Deadlock install
(`cargo run -p valveprotos --bin extract-protos -- [<deadlock dir>] [--raw <dir>]`, from the
crate root), for when the game has updated before steamdb's dump. A port of SteamRE's
[ProtobufDumper](https://github.com/SteamRE/SteamKit/tree/master/Resources/ProtobufDumper),
so the output matches steamdb's files byte for byte.
