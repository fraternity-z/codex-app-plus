pub struct Utf8ChunkDecoder {
    carry: Vec<u8>,
}

impl Utf8ChunkDecoder {
    pub fn new() -> Self {
        Self { carry: Vec::new() }
    }

    pub fn decode(&mut self, bytes: &[u8]) -> Option<String> {
        self.carry.extend_from_slice(bytes);
        match std::str::from_utf8(&self.carry) {
            Ok(text) => {
                let output = text.to_string();
                self.carry.clear();
                Some(output)
            }
            Err(error) if error.error_len().is_none() => {
                self.take_valid_prefix(error.valid_up_to())
            }
            Err(_) => self.take_lossy_buffer(),
        }
    }

    pub fn finish(&mut self) -> Option<String> {
        if self.carry.is_empty() {
            return None;
        }
        self.take_lossy_buffer()
    }

    fn take_valid_prefix(&mut self, length: usize) -> Option<String> {
        if length == 0 {
            return None;
        }
        let output = String::from_utf8_lossy(&self.carry[..length]).into_owned();
        self.carry.drain(..length);
        Some(output)
    }

    fn take_lossy_buffer(&mut self) -> Option<String> {
        if self.carry.is_empty() {
            return None;
        }
        let output = String::from_utf8_lossy(&self.carry).into_owned();
        self.carry.clear();
        Some(output)
    }
}

#[cfg(test)]
mod tests {
    use super::Utf8ChunkDecoder;

    #[test]
    fn decodes_split_multibyte_sequences() {
        let mut decoder = Utf8ChunkDecoder::new();
        let bytes = "你".as_bytes();

        assert_eq!(decoder.decode(&bytes[..1]), None);
        assert_eq!(decoder.decode(&bytes[1..]), Some("你".to_string()));
        assert_eq!(decoder.finish(), None);
    }

    #[test]
    fn replaces_invalid_bytes_without_stalling() {
        let mut decoder = Utf8ChunkDecoder::new();

        assert_eq!(decoder.decode(&[0xff, b'a']), Some("�a".to_string()));
        assert_eq!(decoder.finish(), None);
    }

    #[test]
    fn flushes_incomplete_sequence_on_finish() {
        let mut decoder = Utf8ChunkDecoder::new();
        let bytes = "你".as_bytes();

        assert_eq!(decoder.decode(&bytes[..1]), None);
        assert_eq!(decoder.finish(), Some("�".to_string()));
    }
}
