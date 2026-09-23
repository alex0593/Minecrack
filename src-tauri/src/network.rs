use reqwest::{Client, Url};
use std::sync::OnceLock;
use std::time::Duration;

pub fn provider_url(raw: &str) -> Result<Url, String> {
    let url = Url::parse(raw).map_err(|_| "URL inválida")?;
    let host = url.host_str().ok_or("URL sin host")?;
    let allowed = [
        "minecraft.net",
        "mojang.com",
        "fabricmc.net",
        "quiltmc.org",
        "minecraftforge.net",
        "neoforged.net",
        "prismlauncher.org",
        "modrinth.com",
        "forgecdn.net",
        "curseforge.com",
        "maven.org",
        "aliyun.com",
        "adoptium.net",
        "github.com",
        "githubusercontent.com",
        "githubassets.com",
    ];
    if url.scheme() != "https"
        || url.port_or_known_default() != Some(443)
        || !url.username().is_empty()
        || url.password().is_some()
        || !allowed
            .iter()
            .any(|suffix| host == *suffix || host.ends_with(&format!(".{suffix}")))
    {
        return Err(
            "Origen de descarga no autorizado; se requiere un proveedor HTTPS conocido".into(),
        );
    }
    Ok(url)
}

pub fn client() -> Result<Client, String> {
    static CLIENT: OnceLock<Result<Client, String>> = OnceLock::new();
    CLIENT
        .get_or_init(|| {
            Client::builder()
                .user_agent(concat!("Minecrack/", env!("CARGO_PKG_VERSION")))
                .connect_timeout(Duration::from_secs(15))
                .timeout(Duration::from_secs(600))
                .no_gzip()
                .no_brotli()
                .no_deflate()
                .redirect(reqwest::redirect::Policy::custom(|attempt| {
                    if attempt.previous().len() >= 5
                        || provider_url(attempt.url().as_str()).is_err()
                    {
                        attempt.error("Redirección no autorizada")
                    } else {
                        attempt.follow()
                    }
                }))
                .build()
                .map_err(|e| e.without_url().to_string())
        })
        .clone()
}

pub fn same_origin(base: &Url, raw: &str) -> Result<Url, String> {
    let url = Url::parse(raw).map_err(|_| "URL inválida")?;
    let development =
        cfg!(debug_assertions) && matches!(url.host_str(), Some("localhost" | "127.0.0.1"));
    if (url.scheme() != "https" && !(development && url.scheme() == "http"))
        || url.origin() != base.origin()
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err("La descarga debe usar el origen HTTPS del manifiesto".into());
    }
    Ok(url)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn provider_policy_rejects_http_credentials_and_host_confusion() {
        for bad in [
            "http://libraries.minecraft.net/a",
            "https://minecraft.net.evil.test/a",
            "https://127.0.0.1/a",
            "https://user@libraries.minecraft.net/a",
            "https://libraries.minecraft.net:8443/a",
        ] {
            assert!(provider_url(bad).is_err());
        }
        assert!(provider_url("https://libraries.minecraft.net/a").is_ok());
    }
    #[test]
    fn origin_includes_port_and_scheme() {
        let base = Url::parse("https://packs.example.test").unwrap();
        assert!(same_origin(&base, "https://packs.example.test:8443/a").is_err());
        assert!(same_origin(&base, "http://packs.example.test/a").is_err());
    }
}
