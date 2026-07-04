// Same pipeline as .github/workflows/ci.yaml and .gitlab-ci.yml, for Jenkins.
// Designed for the Kubernetes/self-hosted agents in Repo 6 (self-hosted runners).
pipeline {
  agent any

  environment {
    REGISTRY = 'ghcr.io/aomar97'
  }

  stages {
    stage('lint + test') {
      parallel {
        stage('catalog (go)') {
          agent { docker { image 'golang:1.25' } }
          steps { dir('services/catalog') { sh 'go vet ./... && go test ./...' } }
        }
        stage('orders (python)') {
          agent { docker { image 'python:3.11-slim' } }
          steps {
            dir('services/orders') {
              sh 'pip install -r requirements-dev.txt && ruff check app tests && pytest -q'
            }
          }
        }
        stage('gateway (node)') {
          agent { docker { image 'node:22' } }
          steps { dir('services/gateway') { sh 'npm ci && npm run typecheck && npm test' } }
        }
      }
    }

    stage('build · scan · sbom · sign · push') {
      matrix {
        axes {
          axis { name 'SERVICE'; values 'catalog', 'orders', 'gateway' }
        }
        stages {
          stage('image') {
            steps {
              sh '''
                set -euo pipefail
                IMAGE="$REGISTRY/shop-$SERVICE:$GIT_COMMIT"
                docker build -t "$IMAGE" "services/$SERVICE"
                trivy image --severity HIGH,CRITICAL --ignore-unfixed --exit-code 1 "$IMAGE"
                syft "$IMAGE" -o spdx-json > "sbom-$SERVICE.spdx.json"
                if [ "$BRANCH_NAME" = "main" ]; then
                  docker push "$IMAGE"
                  cosign sign --yes "$IMAGE"
                fi
              '''
              archiveArtifacts artifacts: "sbom-${SERVICE}.spdx.json", allowEmptyArchive: true
            }
          }
        }
      }
    }

    stage('helm') {
      steps {
        sh '''
          helm lint deploy/helm/shop
          helm template shop deploy/helm/shop -f deploy/helm/shop/values-dev.yaml > /dev/null
        '''
      }
    }
  }
}
