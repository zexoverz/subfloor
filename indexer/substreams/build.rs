fn main() -> Result<(), anyhow::Error> {
    println!("cargo:rerun-if-changed=proto");
    Ok(())
}
