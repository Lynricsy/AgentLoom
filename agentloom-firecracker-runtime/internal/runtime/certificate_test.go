package runtime

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"math/big"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestGuestCertificateVerifiesForAllocatedIPAndClientRejectsSharedSNI(t *testing.T) {
	root := t.TempDir()
	caKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now()
	caTemplate := &x509.Certificate{SerialNumber: big.NewInt(1), Subject: pkix.Name{CommonName: "test-ca"}, NotBefore: now.Add(-time.Hour), NotAfter: now.Add(time.Hour), IsCA: true, BasicConstraintsValid: true, KeyUsage: x509.KeyUsageCertSign}
	caDER, err := x509.CreateCertificate(rand.Reader, caTemplate, caTemplate, &caKey.PublicKey, caKey)
	if err != nil {
		t.Fatal(err)
	}
	keyDER, err := x509.MarshalPKCS8PrivateKey(caKey)
	if err != nil {
		t.Fatal(err)
	}
	certificatePath, keyPath := filepath.Join(root, "ca.crt"), filepath.Join(root, "ca.key")
	if err := os.WriteFile(certificatePath, pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: caDER}), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(keyPath, pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: keyDER}), 0o600); err != nil {
		t.Fatal(err)
	}
	issuer, err := newGuestIdentityIssuer(certificatePath, keyPath, "agentloom-guest")
	if err != nil {
		t.Fatal(err)
	}
	certificatePEM, privatePEM, err := issuer.issue("172.30.0.2")
	if err != nil {
		t.Fatal(err)
	}
	if certificatePEM == "" || privatePEM == "" {
		t.Fatal("issuer returned empty identity")
	}
	block, _ := pem.Decode([]byte(certificatePEM))
	certificate, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		t.Fatal(err)
	}
	parsedCA, err := x509.ParseCertificate(caDER)
	if err != nil {
		t.Fatal(err)
	}
	pool := x509.NewCertPool()
	pool.AddCert(parsedCA)
	if _, err := certificate.Verify(x509.VerifyOptions{Roots: pool, DNSName: "agentloom-guest"}); err != nil {
		t.Fatal(err)
	}
	if _, err := certificate.Verify(x509.VerifyOptions{Roots: pool, DNSName: "172.30.0.2"}); err != nil {
		t.Fatal(err)
	}
	if _, err := NewHTTPSGuestChecker(&tls.Config{
		MinVersion: tls.VersionTLS13,
		RootCAs:    pool,
		ServerName: "agentloom-guest",
	}, 8443); err == nil {
		t.Fatal("guest client must not use the shared guest DNS name")
	}
	if _, err := NewHTTPSGuestChecker(&tls.Config{
		MinVersion: tls.VersionTLS13,
		RootCAs:    pool,
	}, 8443); err != nil {
		t.Fatalf("guest client must verify the allocated destination IP: %v", err)
	}
}
