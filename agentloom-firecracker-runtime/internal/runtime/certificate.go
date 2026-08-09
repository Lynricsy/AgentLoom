package runtime

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"errors"
	"math/big"
	"net"
	"os"
	"time"
)

type guestIdentityIssuer struct {
	certificate *x509.Certificate
	privateKey  *rsa.PrivateKey
	serverName  string
}

func newGuestIdentityIssuer(certificatePath, keyPath, serverName string) (*guestIdentityIssuer, error) {
	certificatePEM, err := os.ReadFile(certificatePath)
	if err != nil {
		return nil, err
	}
	certificateBlock, _ := pem.Decode(certificatePEM)
	if certificateBlock == nil || certificateBlock.Type != "CERTIFICATE" {
		return nil, errors.New("guest CA certificate is invalid")
	}
	certificate, err := x509.ParseCertificate(certificateBlock.Bytes)
	if err != nil {
		return nil, err
	}
	keyPEM, err := os.ReadFile(keyPath)
	if err != nil {
		return nil, err
	}
	keyBlock, _ := pem.Decode(keyPEM)
	if keyBlock == nil {
		return nil, errors.New("guest CA private key is invalid")
	}
	var privateKey *rsa.PrivateKey
	if parsed, parseErr := x509.ParsePKCS8PrivateKey(keyBlock.Bytes); parseErr == nil {
		privateKey, _ = parsed.(*rsa.PrivateKey)
	} else if parsed, parseErr := x509.ParsePKCS1PrivateKey(keyBlock.Bytes); parseErr == nil {
		privateKey = parsed
	}
	if privateKey == nil {
		return nil, errors.New("guest CA private key must be RSA PKCS1 or PKCS8")
	}
	if !certificate.IsCA || serverName == "" {
		return nil, errors.New("guest CA and server name are required")
	}
	return &guestIdentityIssuer{certificate: certificate, privateKey: privateKey, serverName: serverName}, nil
}

func (issuer *guestIdentityIssuer) issue(guestIP string) (string, string, error) {
	ip := net.ParseIP(guestIP)
	if ip == nil {
		return "", "", errors.New("invalid guest IP for certificate")
	}
	serialLimit := new(big.Int).Lsh(big.NewInt(1), 128)
	serial, err := rand.Int(rand.Reader, serialLimit)
	if err != nil {
		return "", "", err
	}
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return "", "", err
	}
	now := time.Now().UTC()
	template := &x509.Certificate{
		SerialNumber: serial, Subject: pkix.Name{CommonName: issuer.serverName},
		NotBefore: now.Add(-5 * time.Minute), NotAfter: now.Add(24 * time.Hour),
		KeyUsage:    x509.KeyUsageDigitalSignature | x509.KeyUsageKeyEncipherment,
		ExtKeyUsage: []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		DNSNames:    []string{issuer.serverName}, IPAddresses: []net.IP{ip},
	}
	certificateDER, err := x509.CreateCertificate(rand.Reader, template, issuer.certificate, &privateKey.PublicKey, issuer.privateKey)
	if err != nil {
		return "", "", err
	}
	privateDER, err := x509.MarshalPKCS8PrivateKey(privateKey)
	if err != nil {
		return "", "", err
	}
	certificatePEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: certificateDER})
	privatePEM := pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: privateDER})
	return string(certificatePEM), string(privatePEM), nil
}
